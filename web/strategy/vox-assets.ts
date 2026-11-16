import type {VoxEvent} from './vox-cues';
export const VOX_LINES: {id:string;text:string;unit?:string;event:VoxEvent;sources:Record<string,string>}[] = [
  {
    "id": "select-vael-1",
    "text": "Oui, commandant.",
    "unit": "t0",
    "event": "select",
    "sources": {
      "t0": "/web/sfx/vox/t0-select-vael-1-vox2.mp3"
    }
  },
  {
    "id": "select-vael-2",
    "text": "J'écoute, commandant.",
    "unit": "t0",
    "event": "select",
    "sources": {
      "t0": "/web/sfx/vox/t0-select-vael-2-vox2.mp3"
    }
  },
  {
    "id": "select-vael-3",
    "text": "Votre volonté sera faite.",
    "unit": "t0",
    "event": "select",
    "sources": {
      "t0": "/web/sfx/vox/t0-select-vael-3-vox2.mp3"
    }
  },
  {
    "id": "select-tor-1",
    "text": "Prêt à faire mon devoir.",
    "unit": "t1",
    "event": "select",
    "sources": {
      "t1": "/web/sfx/vox/t1-select-tor-1-vox2.mp3"
    }
  },
  {
    "id": "select-tor-2",
    "text": "Mon armure tient. Vos ordres ?",
    "unit": "t1",
    "event": "select",
    "sources": {
      "t1": "/web/sfx/vox/t1-select-tor-2-vox2.mp3"
    }
  },
  {
    "id": "select-tor-3",
    "text": "Parlez, commandant.",
    "unit": "t1",
    "event": "select",
    "sources": {
      "t1": "/web/sfx/vox/t1-select-tor-3-vox2.mp3"
    }
  },
  {
    "id": "select-cael-1",
    "text": "Canal ouvert, commandant.",
    "unit": "t2",
    "event": "select",
    "sources": {
      "t2": "/web/sfx/vox/t2-select-cael-1-vox2.mp3"
    }
  },
  {
    "id": "select-cael-2",
    "text": "À l'écoute. Pour l'Empereur.",
    "unit": "t2",
    "event": "select",
    "sources": {
      "t2": "/web/sfx/vox/t2-select-cael-2-vox2.mp3"
    }
  },
  {
    "id": "select-cael-3",
    "text": "Mes sens sont en éveil.",
    "unit": "t2",
    "event": "select",
    "sources": {
      "t2": "/web/sfx/vox/t2-select-cael-3-vox2.mp3"
    }
  },
  {
    "id": "select-brann-1",
    "text": "Le devoir m'appelle.",
    "unit": "t3",
    "event": "select",
    "sources": {
      "t3": "/web/sfx/vox/t3-select-brann-1-vox2.mp3"
    }
  },
  {
    "id": "select-brann-2",
    "text": "Toujours fidèle, commandant.",
    "unit": "t3",
    "event": "select",
    "sources": {
      "t3": "/web/sfx/vox/t3-select-brann-2-vox2.mp3"
    }
  },
  {
    "id": "select-brann-3",
    "text": "Que l'Empereur nous guide.",
    "unit": "t3",
    "event": "select",
    "sources": {
      "t3": "/web/sfx/vox/t3-select-brann-3-vox2.mp3"
    }
  },
  {
    "id": "ack-move-1",
    "text": "À vos ordres.",
    "event": "ack-move",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-move-1-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-move-1-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-move-1-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-move-1-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-move-1-vox2.mp3"
    }
  },
  {
    "id": "ack-move-2",
    "text": "Itinéraire reçu.",
    "event": "ack-move",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-move-2-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-move-2-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-move-2-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-move-2-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-move-2-vox2.mp3"
    }
  },
  {
    "id": "ack-fire-1",
    "text": "Coordonnées de tir reçues.",
    "event": "ack-fire",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-fire-1-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-fire-1-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-fire-1-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-fire-1-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-fire-1-vox2.mp3"
    }
  },
  {
    "id": "ack-fire-2",
    "text": "Bolter prêt.",
    "event": "ack-fire",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-fire-2-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-fire-2-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-fire-2-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-fire-2-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-fire-2-vox2.mp3"
    }
  },
  {
    "id": "ack-guard-1",
    "text": "Je couvrirai ce secteur.",
    "event": "ack-guard",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-guard-1-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-guard-1-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-guard-1-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-guard-1-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-guard-1-vox2.mp3"
    }
  },
  {
    "id": "ack-guard-2",
    "text": "Position de veille confirmée.",
    "event": "ack-guard",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-guard-2-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-guard-2-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-guard-2-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-guard-2-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-guard-2-vox2.mp3"
    }
  },
  {
    "id": "ack-scan-1",
    "text": "Auspex prêt, commandant.",
    "event": "ack-scan",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-scan-1-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-scan-1-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-scan-1-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-scan-1-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-scan-1-vox2.mp3"
    }
  },
  {
    "id": "ack-scan-2",
    "text": "Reconnaissance, bien reçu.",
    "event": "ack-scan",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-scan-2-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-scan-2-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-scan-2-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-scan-2-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-scan-2-vox2.mp3"
    }
  },
  {
    "id": "ack-interact-1",
    "text": "Ordre reçu. Je m'en charge.",
    "event": "ack-interact",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-interact-1-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-interact-1-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-interact-1-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-interact-1-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-interact-1-vox2.mp3"
    }
  },
  {
    "id": "ack-interact-2",
    "text": "Interface repérée.",
    "event": "ack-interact",
    "sources": {
      "t0": "/web/sfx/vox/t0-ack-interact-2-vox2.mp3",
      "t1": "/web/sfx/vox/t1-ack-interact-2-vox2.mp3",
      "t2": "/web/sfx/vox/t2-ack-interact-2-vox2.mp3",
      "t3": "/web/sfx/vox/t3-ack-interact-2-vox2.mp3",
      "command": "/web/sfx/vox/command-ack-interact-2-vox2.mp3"
    }
  },
  {
    "id": "execute-1",
    "text": "J'exécute.",
    "event": "execute",
    "sources": {
      "t0": "/web/sfx/vox/t0-execute-1-vox2.mp3",
      "t1": "/web/sfx/vox/t1-execute-1-vox2.mp3",
      "t2": "/web/sfx/vox/t2-execute-1-vox2.mp3",
      "t3": "/web/sfx/vox/t3-execute-1-vox2.mp3",
      "command": "/web/sfx/vox/command-execute-1-vox2.mp3"
    }
  },
  {
    "id": "execute-2",
    "text": "Frères, en avant.",
    "event": "execute",
    "sources": {
      "t0": "/web/sfx/vox/t0-execute-2-vox2.mp3",
      "t1": "/web/sfx/vox/t1-execute-2-vox2.mp3",
      "t2": "/web/sfx/vox/t2-execute-2-vox2.mp3",
      "t3": "/web/sfx/vox/t3-execute-2-vox2.mp3",
      "command": "/web/sfx/vox/command-execute-2-vox2.mp3"
    }
  },
  {
    "id": "moving",
    "text": "Progression en cours.",
    "event": "moving",
    "sources": {
      "t0": "/web/sfx/vox/t0-moving-vox2.mp3",
      "t1": "/web/sfx/vox/t1-moving-vox2.mp3",
      "t2": "/web/sfx/vox/t2-moving-vox2.mp3",
      "t3": "/web/sfx/vox/t3-moving-vox2.mp3",
      "command": "/web/sfx/vox/command-moving-vox2.mp3"
    }
  }
];
