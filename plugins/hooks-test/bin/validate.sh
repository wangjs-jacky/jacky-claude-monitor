#!/bin/bash
# bin/validate.sh
# Hooks Test 验证引擎 - 使用 Python 实现
# 读取 captures/*.jsonl + schemas.json → 生成 report.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$HOME/.claude-hooks-test"
CAPTURE_DIR="$TEST_DIR/captures"
SCHEMA_FILE="$SCRIPT_DIR/../hooks/schemas.json"
REPORT_FILE="$TEST_DIR/report.json"

# 检查依赖
if ! command -v python3 &> /dev/null; then
  echo "错误: 需要 python3" >&2
  exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "错误: schemas.json 不存在: $SCHEMA_FILE" >&2
  exit 1
fi

# 确定要验证的 session
TARGET_SESSION=""
if [ -n "${1:-}" ]; then
  TARGET_SESSION="$1"
elif [ -f "$TEST_DIR/latest-session" ]; then
  TARGET_SESSION=$(cat "$TEST_DIR/latest-session")
fi

# 检查捕获文件
if [ -n "$TARGET_SESSION" ]; then
  CAPTURE_FILE="$CAPTURE_DIR/${TARGET_SESSION}.jsonl"
  if [ ! -f "$CAPTURE_FILE" ]; then
    echo "错误: 未找到捕获文件: $CAPTURE_FILE" >&2
    exit 1
  fi
fi

# 执行 Python 验证
python3 << 'PYTHON_SCRIPT'
import json, sys, os, re, glob
from datetime import datetime, timezone

test_dir = os.environ.get("HOME", "") + "/.claude-hooks-test"
capture_dir = test_dir + "/captures"
schema_file = os.environ.get("SCHEMA_FILE", "")
report_file = test_dir + "/report.json"
target_session = os.environ.get("TARGET_SESSION", "")

# 读取 schema
with open(schema_file) as f:
    schema = json.load(f)

schemas = schema.get("schemas", {})
event_names = sorted(schemas.keys())

# 收集捕获文件
if target_session:
    capture_files = [f"{capture_dir}/{target_session}.jsonl"]
else:
    capture_files = sorted(glob.glob(f"{capture_dir}/*.jsonl"))

if not capture_files or not all(os.path.isfile(f) for f in capture_files):
    print("错误: 没有找到捕获数据", file=sys.stderr)
    sys.exit(1)

# 读取所有记录
all_records = []
for cf in capture_files:
    if not os.path.isfile(cf):
        continue
    with open(cf) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                all_records.append(record)
            except json.JSONDecodeError:
                all_records.append({"_raw": line, "_parse_error": True})

# 初始化结果
results = {
    "version": "1.0.0",
    "test_time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "total_events": 0,
    "total_checks": 0,
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "summary": {},
    "coverage": {"triggered": [], "not_triggered": [], "rate": ""},
    "extra_fields_discovered": {}
}

# 初始化每个事件的摘要
for event in event_names:
    results["summary"][event] = {
        "count": 0,
        "status": "SKIP",
        "checks": 0,
        "failures": [],
        "note": "未触发"
    }

def check_type(value, expected_type):
    """检查值的类型是否匹配"""
    type_map = {
        "string": str,
        "object": dict,
        "array": list,
        "boolean": bool,
        "number": (int, float),
    }
    expected = type_map.get(expected_type)
    if expected is None:
        return True, ""
    if not isinstance(value, expected):
        actual = type(value).__name__
        return False, f"类型不匹配: 期望 {expected_type}, 实际 {actual}"
    return True, ""

def check_pattern(value, pattern):
    """检查字符串是否匹配正则"""
    if pattern and isinstance(value, str):
        if not re.search(pattern, value):
            return False, f"格式不匹配: pattern={pattern}"
    return True, ""

def check_const(value, const_val):
    """检查值是否等于常量"""
    if const_val is not None and value != const_val:
        return False, f"值不匹配: 期望={const_val}, 实际={value}"
    return True, ""

def validate_field_value(value, field_spec):
    """验证单个字段的值"""
    expected_type = field_spec.get("type", "string")

    # 类型检查
    ok, msg = check_type(value, expected_type)
    if not ok:
        return msg

    # 字符串特殊检查
    if expected_type == "string" and isinstance(value, str):
        # pattern
        ok, msg = check_pattern(value, field_spec.get("pattern"))
        if not ok:
            return msg
        # const
        ok, msg = check_const(value, field_spec.get("const"))
        if not ok:
            return msg
        # min_length
        min_len = field_spec.get("min_length", 0)
        if len(value) < min_len:
            return f"长度不足: 要求>={min_len}, 实际={len(value)}"

    return "PASS"

def validate_record(record):
    """验证单条记录"""
    hook = record.get("hook", "")
    seq = record.get("seq", 0)
    stdin_data = record.get("stdin")
    valid_json = record.get("valid_json", True)

    results["total_events"] += 1

    # 检查 hook 是否在 schema 中
    if hook not in schemas:
        return

    event_summary = results["summary"][hook]
    event_summary["count"] += 1

    # 1. JSON 有效性
    results["total_checks"] += 1
    if not valid_json or stdin_data is None or not isinstance(stdin_data, dict):
        results["failed"] += 1
        event_summary["status"] = "FAIL"
        event_summary["failures"].append({
            "seq": seq, "field": "stdin",
            "issue": "无效 JSON 或非对象", "severity": "error"
        })
        return
    results["passed"] += 1

    # 2. hook_event_name 一致性
    results["total_checks"] += 1
    event_summary["checks"] += 1
    actual_event = stdin_data.get("hook_event_name", "")
    if actual_event == hook:
        results["passed"] += 1
    else:
        results["failed"] += 1
        event_summary["status"] = "FAIL"
        event_summary["failures"].append({
            "seq": seq, "field": "hook_event_name",
            "issue": f"期望={hook}, 实际={actual_event}", "severity": "error"
        })

    # 3. 必需字段
    hook_schema = schemas[hook]
    required = hook_schema.get("required_fields", {})
    for field_name, field_spec in required.items():
        results["total_checks"] += 1
        event_summary["checks"] += 1

        if field_name not in stdin_data:
            results["failed"] += 1
            event_summary["status"] = "FAIL"
            event_summary["failures"].append({
                "seq": seq, "field": field_name,
                "issue": "缺失必需字段", "severity": "error"
            })
        else:
            value = stdin_data[field_name]
            result = validate_field_value(value, field_spec)
            if result == "PASS":
                results["passed"] += 1
            else:
                results["failed"] += 1
                event_summary["status"] = "FAIL"
                event_summary["failures"].append({
                    "seq": seq, "field": field_name,
                    "issue": result, "severity": "error"
                })

    # 4. 可选字段类型检查
    optional = hook_schema.get("optional_fields", {})
    for field_name, field_spec in optional.items():
        if field_name in stdin_data:
            results["total_checks"] += 1
            event_summary["checks"] += 1

            value = stdin_data[field_name]
            result = validate_field_value(value, field_spec)
            if result == "PASS":
                results["passed"] += 1
            else:
                results["warnings"] += 1
                event_summary["failures"].append({
                    "seq": seq, "field": field_name,
                    "issue": result, "severity": "warning"
                })

    # 5. 额外字段发现
    all_schema_fields = set(required.keys()) | set(optional.keys())
    extra_key = hook
    for key in stdin_data:
        if key not in all_schema_fields:
            if extra_key not in results["extra_fields_discovered"]:
                results["extra_fields_discovered"][extra_key] = []
            if key not in results["extra_fields_discovered"][extra_key]:
                results["extra_fields_discovered"][extra_key].append(key)

# 执行验证
for record in all_records:
    validate_record(record)

# 计算覆盖率
for event in event_names:
    summary = results["summary"][event]
    count = summary["count"]
    if count > 0:
        results["coverage"]["triggered"].append(event)
        if summary["status"] != "FAIL":
            summary["status"] = "PASS"
            summary["note"] = ""
    else:
        results["coverage"]["not_triggered"].append(event)

triggered = len(results["coverage"]["triggered"])
total = len(event_names)
results["coverage"]["rate"] = f"{triggered}/{total}"

results["test_end"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# 写入报告
with open(report_file, "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

# 输出摘要
print(f"验证完成: {report_file}")
print(f"  事件总数: {results['total_events']}")
print(f"  检查总数: {results['total_checks']}")
print(f"  通过: {results['passed']} / 失败: {results['failed']} / 警告: {results['warnings']}")
print(f"  覆盖率: {results['coverage']['rate']}")

PYTHON_SCRIPT
