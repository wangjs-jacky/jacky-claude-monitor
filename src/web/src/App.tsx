import { useWebSocket } from './hooks/useWebSocket';
import { ControlPanel } from './components/ControlPanel';
import { SessionList } from './components/SessionList';
import { EventTimeline } from './components/EventTimeline';

const PORT = 17530;

function App() {
  const { sessions, events, connected, killSession } = useWebSocket();

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <ControlPanel sessions={sessions} connected={connected} port={PORT} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SessionList sessions={sessions} onKill={killSession} />
          <EventTimeline events={events} />
        </div>
      </div>
    </div>
  );
}

export default App;
