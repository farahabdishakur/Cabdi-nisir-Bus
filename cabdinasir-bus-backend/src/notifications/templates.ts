/** Fariimaha SMS (Af-Soomaali). {var} waxaa lagu beddelaa xogta. */
export const TEMPLATES = {
  PARCEL_REGISTERED:
    'Cabdinasir Bus: {sender} ayaa kuu soo diray alaab ({pieces} xabbo) {from} - {to}. Koodh: {code}. PIN: {pin}.{cod} Ha la wadaagin PIN-ka.',
  PARCEL_ARRIVED: 'Cabdinasir Bus: Alaabtaada {code} waxay timid laanta {to}. Kaalay la imow PIN-ka.{cod}',
  PARCEL_REMINDER:
    'Cabdinasir Bus: Xusuusin - alaabtaada {code} weli waxay taal laanta {to}. Ka dib {days} maalmood waxaa la bixiyaa khidmad kayd.',
  PARCEL_PIN_RESET: 'Cabdinasir Bus: PIN cusub ee alaabta {code}: PIN: {pin}. PIN-kii hore waa la joojiyay.',
  INTEGRITY_ALERT: 'Cabdinasir Bus (digniin): {issues} arrimood oo lacag/alaab ah ayaa u baahan eegid. Fur warbixinta Integrity.',
  PARCEL_DELIVERED: 'Cabdinasir Bus: Alaabtii aad u dirtay {receiver} ({code}) waa la gaarsiiyay. Mahadsanid.',
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

export function render(key: TemplateKey, vars: Record<string, string | number>): string {
  return TEMPLATES[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** PIN-ka lagama tago DB-ga marka SMS-ka la diro. */
export const redactPin = (body: string) => body.replace(/PIN: \d{4}/g, 'PIN: ****');
