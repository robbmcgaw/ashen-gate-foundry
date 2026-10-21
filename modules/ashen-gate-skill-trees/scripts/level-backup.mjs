/** Character Hub's level-up backup copies (flag ashen-gate-character-hub.levelBackup): never listed, never a target. Safe without the Hub. */
export const LEVEL_BACKUP_REFUSAL='That is a level backup copy, not a playable character.';
export const isLevelBackup=actor=>!!actor?.flags?.['ashen-gate-character-hub']?.levelBackup;
export function assertNotLevelBackup(actor){if(isLevelBackup(actor))throw Error(LEVEL_BACKUP_REFUSAL);return actor;}
