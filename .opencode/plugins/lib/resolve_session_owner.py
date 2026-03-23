import glob
import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        return 0

    session_id = sys.argv[1]
    store_dir = os.path.join('runtime', 'noctis-missions')
    if not os.path.isdir(store_dir):
        return 0

    for path in glob.glob(os.path.join(store_dir, '*.json')):
        try:
            with open(path, 'r', encoding='utf-8') as file:
                mission = json.load(file)
        except Exception:
            continue

        if mission.get('noctisSessionId') == session_id:
            print(json.dumps({'agentId': 'noctis', 'missionId': mission.get('id')}))
            return 0

        worker_sessions = mission.get('workerSessions') or {}
        for agent_id in ('ignis', 'gladiolus', 'prompto'):
            if worker_sessions.get(agent_id) == session_id:
                print(json.dumps({'agentId': agent_id, 'missionId': mission.get('id')}))
                return 0

    return 0


if __name__ == '__main__':
    raise SystemExit(main())