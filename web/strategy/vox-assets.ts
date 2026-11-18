import type {VoxEvent} from './vox-cues';
export const VOX_LINES: {id:string;text:string;unit?:string;faction:'imperium'|'nightlords';event:VoxEvent;sources:Record<string,string>}[] = [
  {
    "id": "select-vael-1",
    "text": "Oui, commandant.",
    "unit": "t0",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-select-vael-1-vox2.mp3"
    }
  },
  {
    "id": "select-vael-2",
    "text": "J'écoute, commandant.",
    "unit": "t0",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-select-vael-2-vox2.mp3"
    }
  },
  {
    "id": "select-vael-3",
    "text": "Votre volonté sera faite.",
    "unit": "t0",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-select-vael-3-vox2.mp3"
    }
  },
  {
    "id": "select-tor-1",
    "text": "Prêt à faire mon devoir.",
    "unit": "t1",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t1": "/web/sfx/vox/t1-select-tor-1-vox2.mp3"
    }
  },
  {
    "id": "select-tor-2",
    "text": "Mon armure tient. Vos ordres ?",
    "unit": "t1",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t1": "/web/sfx/vox/t1-select-tor-2-vox2.mp3"
    }
  },
  {
    "id": "select-tor-3",
    "text": "Parlez, commandant.",
    "unit": "t1",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t1": "/web/sfx/vox/t1-select-tor-3-vox2.mp3"
    }
  },
  {
    "id": "select-cael-1",
    "text": "Canal ouvert, commandant.",
    "unit": "t2",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t2": "/web/sfx/vox/t2-select-cael-1-vox2.mp3"
    }
  },
  {
    "id": "select-cael-2",
    "text": "À l'écoute. Pour l'Empereur.",
    "unit": "t2",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t2": "/web/sfx/vox/t2-select-cael-2-vox2.mp3"
    }
  },
  {
    "id": "select-cael-3",
    "text": "Mes sens sont en éveil.",
    "unit": "t2",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t2": "/web/sfx/vox/t2-select-cael-3-vox2.mp3"
    }
  },
  {
    "id": "select-brann-1",
    "text": "Le devoir m'appelle.",
    "unit": "t3",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t3": "/web/sfx/vox/t3-select-brann-1-vox2.mp3"
    }
  },
  {
    "id": "select-brann-2",
    "text": "Toujours fidèle, commandant.",
    "unit": "t3",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t3": "/web/sfx/vox/t3-select-brann-2-vox2.mp3"
    }
  },
  {
    "id": "select-brann-3",
    "text": "Que l'Empereur nous guide.",
    "unit": "t3",
    "event": "select",
    "faction": "imperium",
    "sources": {
      "t3": "/web/sfx/vox/t3-select-brann-3-vox2.mp3"
    }
  },
  {
    "id": "ack-move-1",
    "text": "À vos ordres.",
    "event": "ack-move",
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
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
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-moving-vox2.mp3",
      "t1": "/web/sfx/vox/t1-moving-vox2.mp3",
      "t2": "/web/sfx/vox/t2-moving-vox2.mp3",
      "t3": "/web/sfx/vox/t3-moving-vox2.mp3",
      "command": "/web/sfx/vox/command-moving-vox2.mp3"
    }
  },
  {
    "id": "firing",
    "text": "Feu purificateur !",
    "event": "firing",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-firing-vox2.mp3",
      "t1": "/web/sfx/vox/t1-firing-vox2.mp3",
      "t2": "/web/sfx/vox/t2-firing-vox2.mp3",
      "t3": "/web/sfx/vox/t3-firing-vox2.mp3",
      "command": "/web/sfx/vox/command-firing-vox2.mp3"
    }
  },
  {
    "id": "scanning",
    "text": "Balayage auspex en cours.",
    "event": "scanning",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-scanning-vox2.mp3",
      "t1": "/web/sfx/vox/t1-scanning-vox2.mp3",
      "t2": "/web/sfx/vox/t2-scanning-vox2.mp3",
      "t3": "/web/sfx/vox/t3-scanning-vox2.mp3",
      "command": "/web/sfx/vox/command-scanning-vox2.mp3"
    }
  },
  {
    "id": "working",
    "text": "Connexion aux systèmes.",
    "event": "working",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-working-vox2.mp3",
      "t1": "/web/sfx/vox/t1-working-vox2.mp3",
      "t2": "/web/sfx/vox/t2-working-vox2.mp3",
      "t3": "/web/sfx/vox/t3-working-vox2.mp3",
      "command": "/web/sfx/vox/command-working-vox2.mp3"
    }
  },
  {
    "id": "guarding",
    "text": "Secteur sous surveillance.",
    "event": "guarding",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-guarding-vox2.mp3",
      "t1": "/web/sfx/vox/t1-guarding-vox2.mp3",
      "t2": "/web/sfx/vox/t2-guarding-vox2.mp3",
      "t3": "/web/sfx/vox/t3-guarding-vox2.mp3",
      "command": "/web/sfx/vox/command-guarding-vox2.mp3"
    }
  },
  {
    "id": "door-open",
    "text": "Passage ouvert.",
    "event": "door-open",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-door-open-vox2.mp3",
      "t1": "/web/sfx/vox/t1-door-open-vox2.mp3",
      "t2": "/web/sfx/vox/t2-door-open-vox2.mp3",
      "t3": "/web/sfx/vox/t3-door-open-vox2.mp3",
      "command": "/web/sfx/vox/command-door-open-vox2.mp3"
    }
  },
  {
    "id": "door-closed",
    "text": "Sas verrouillé.",
    "event": "door-closed",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-door-closed-vox2.mp3",
      "t1": "/web/sfx/vox/t1-door-closed-vox2.mp3",
      "t2": "/web/sfx/vox/t2-door-closed-vox2.mp3",
      "t3": "/web/sfx/vox/t3-door-closed-vox2.mp3",
      "command": "/web/sfx/vox/command-door-closed-vox2.mp3"
    }
  },
  {
    "id": "secured",
    "text": "Objectif sécurisé, commandant.",
    "event": "secured",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-secured-vox2.mp3",
      "t1": "/web/sfx/vox/t1-secured-vox2.mp3",
      "t2": "/web/sfx/vox/t2-secured-vox2.mp3",
      "t3": "/web/sfx/vox/t3-secured-vox2.mp3",
      "command": "/web/sfx/vox/command-secured-vox2.mp3"
    }
  },
  {
    "id": "blocked",
    "text": "Progression bloquée.",
    "event": "blocked",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-blocked-vox2.mp3",
      "t1": "/web/sfx/vox/t1-blocked-vox2.mp3",
      "t2": "/web/sfx/vox/t2-blocked-vox2.mp3",
      "t3": "/web/sfx/vox/t3-blocked-vox2.mp3",
      "command": "/web/sfx/vox/command-blocked-vox2.mp3"
    }
  },
  {
    "id": "contact",
    "text": "Contact visuel. L'ennemi est là.",
    "event": "contact",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-contact-vox2.mp3",
      "t1": "/web/sfx/vox/t1-contact-vox2.mp3",
      "t2": "/web/sfx/vox/t2-contact-vox2.mp3",
      "t3": "/web/sfx/vox/t3-contact-vox2.mp3",
      "command": "/web/sfx/vox/command-contact-vox2.mp3"
    }
  },
  {
    "id": "hurt",
    "text": "Armure touchée. Je tiens.",
    "event": "hurt",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-hurt-vox2.mp3",
      "t1": "/web/sfx/vox/t1-hurt-vox2.mp3",
      "t2": "/web/sfx/vox/t2-hurt-vox2.mp3",
      "t3": "/web/sfx/vox/t3-hurt-vox2.mp3",
      "command": "/web/sfx/vox/command-hurt-vox2.mp3"
    }
  },
  {
    "id": "kill",
    "text": "Ennemi neutralisé.",
    "event": "kill",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-kill-vox2.mp3",
      "t1": "/web/sfx/vox/t1-kill-vox2.mp3",
      "t2": "/web/sfx/vox/t2-kill-vox2.mp3",
      "t3": "/web/sfx/vox/t3-kill-vox2.mp3",
      "command": "/web/sfx/vox/command-kill-vox2.mp3"
    }
  },
  {
    "id": "fallen",
    "text": "Un frère est tombé.",
    "event": "fallen",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-fallen-vox2.mp3",
      "t1": "/web/sfx/vox/t1-fallen-vox2.mp3",
      "t2": "/web/sfx/vox/t2-fallen-vox2.mp3",
      "t3": "/web/sfx/vox/t3-fallen-vox2.mp3",
      "command": "/web/sfx/vox/command-fallen-vox2.mp3"
    }
  },
  {
    "id": "recon-done",
    "text": "Balayage terminé.",
    "event": "recon-done",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-recon-done-vox2.mp3",
      "t1": "/web/sfx/vox/t1-recon-done-vox2.mp3",
      "t2": "/web/sfx/vox/t2-recon-done-vox2.mp3",
      "t3": "/web/sfx/vox/t3-recon-done-vox2.mp3",
      "command": "/web/sfx/vox/command-recon-done-vox2.mp3"
    }
  },
  {
    "id": "victory",
    "text": "La victoire est à l'Empereur.",
    "event": "victory",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-victory-vox2.mp3",
      "t1": "/web/sfx/vox/t1-victory-vox2.mp3",
      "t2": "/web/sfx/vox/t2-victory-vox2.mp3",
      "t3": "/web/sfx/vox/t3-victory-vox2.mp3",
      "command": "/web/sfx/vox/command-victory-vox2.mp3"
    }
  },
  {
    "id": "defeat",
    "text": "Opération compromise. Repli.",
    "event": "defeat",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-defeat-vox2.mp3",
      "t1": "/web/sfx/vox/t1-defeat-vox2.mp3",
      "t2": "/web/sfx/vox/t2-defeat-vox2.mp3",
      "t3": "/web/sfx/vox/t3-defeat-vox2.mp3",
      "command": "/web/sfx/vox/command-defeat-vox2.mp3"
    }
  },
  {
    "id": "cancel",
    "text": "Ordre annulé.",
    "event": "cancel",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-cancel-vox2.mp3",
      "t1": "/web/sfx/vox/t1-cancel-vox2.mp3",
      "t2": "/web/sfx/vox/t2-cancel-vox2.mp3",
      "t3": "/web/sfx/vox/t3-cancel-vox2.mp3",
      "command": "/web/sfx/vox/command-cancel-vox2.mp3"
    }
  },
  {
    "id": "invalid",
    "text": "Impossible, commandant.",
    "event": "invalid",
    "faction": "imperium",
    "sources": {
      "t0": "/web/sfx/vox/t0-invalid-vox2.mp3",
      "t1": "/web/sfx/vox/t1-invalid-vox2.mp3",
      "t2": "/web/sfx/vox/t2-invalid-vox2.mp3",
      "t3": "/web/sfx/vox/t3-invalid-vox2.mp3",
      "command": "/web/sfx/vox/command-invalid-vox2.mp3"
    }
  },
  {
    "id": "nl-taunt-1",
    "text": "Nous venons pour vous.",
    "event": "nl-taunt",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-taunt-1-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-taunt-2",
    "text": "Votre peur nous appartient.",
    "event": "nl-taunt",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-taunt-2-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-attack-1",
    "text": "Ave Dominus Nox !",
    "event": "nl-attack",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-attack-1-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-attack-2",
    "text": "Que la terreur commence !",
    "event": "nl-attack",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-attack-2-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-hurt-1",
    "text": "Vous allez le regretter.",
    "event": "nl-hurt",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-hurt-1-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-death-1",
    "text": "La nuit... m'emporte.",
    "event": "nl-death",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-death-1-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-attack-growl",
    "event": "nl-attack",
    "text": "[Cri de combat]",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-attack-growl-chaos-vox3.mp3"
    }
  },
  {
    "id": "nl-death-growl",
    "event": "nl-death",
    "text": "[Râle étouffé]",
    "faction": "nightlords",
    "sources": {
      "nightlords": "/web/sfx/vox/nightlords-nl-death-growl-chaos-vox3.mp3"
    }
  }
];
