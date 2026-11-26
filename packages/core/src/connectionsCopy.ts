/**
 * The English wording of tools, phase 2: each person's own accounts (UI-CONV-044, UI-CONV-045, UI-CONV-047..050,
 * UI-CONV-053..058, UI-APPR-006; AG-UI profile 3.5), written once for the browser and the Ayni app: the browser's
 * English translation file must say the same (a test compares them, row by row of the table of UI-CONV-058), and the
 * app starts from these (APP-CONV-058). Keys are paths in the translation file; `{{name}}` marks what the screen puts
 * in. The Info of a message held back for a credential is `conversation.withheldCredentialInfo`, followed, for an
 * agent that declares `features.connections`, by `conversation.withheldCredentialAccounts` (UI-SEC-006). With features
 * (package 3.5.8, UI-CONV-064): `accounts.features`, the features an account serves, "For Files, Calendar"; and the
 * Connect card names the account and its feature, "Connect your Google account to use Calendar." (UI-CONV-057). With an
 * account that several sources use (package 3.5.10, UI-CONV-061): the table of UI-CONV-063, `accounts.access.*` for the
 * line of each source ("Google Drive: allowed in part", then "Not allowed: Create a file"), `accounts.allow` and
 * `accounts.allowMore`, the card's `accounts.card.allow`, and, for the agent's key service, `accounts.outcome.unavailable`
 * (also `503 keys-unavailable`) and `accounts.outcome.disconnectedNotTold`.
 */
export const CONNECTIONS_COPY = {
  'accounts.menu': 'Your accounts',
  'accounts.title': 'Your accounts in {{agent}}',
  'accounts.intro': '{{agent}} uses these accounts with your own rights at each service. Only you connect them.',
  'accounts.usedIn.all': 'Used in all your conversations',
  'accounts.usedIn.places': 'Used in {{places}}',
  'accounts.usedIn.none': 'Not used now',
  'accounts.binding': '{{label}}: {{value}}',
  'accounts.features': 'For {{features}}',
  'accounts.state.notConnected': 'Not connected',
  'accounts.state.connected': 'Connected as {{label}} · since {{date}}',
  'accounts.state.connectedNoLabel': 'Connected · since {{date}}',
  'accounts.state.moreAccess': '{{source}} asks for more access. Reconnect to give it.',
  'accounts.state.expired': '{{source}} signed you out. Reconnect to use it again.',
  'accounts.state.revoked': '{{source}} no longer accepts this connection. Reconnect to use it again.',
  'accounts.state.changed': '{{agent}} changed how it connects to {{source}}. Reconnect to use it again.',
  'accounts.connect': 'Connect',
  'accounts.reconnect': 'Reconnect',
  'accounts.disconnect': 'Disconnect',
  'accounts.cancel': 'Cancel',
  'accounts.waiting': 'Finish in the browser · {{time}} left',
  'accounts.outcome.connected': 'Connected as {{label}}',
  'accounts.outcome.connectedNoLabel': 'Connected',
  'accounts.outcome.denied': 'Not connected: you did not allow {{agent}} at {{source}}.',
  'accounts.outcome.failed': 'Not connected: {{source}} did not complete the sign-in. Try again.',
  'accounts.outcome.expired': 'Not connected in time. Try again.',
  'accounts.outcome.cancelled': 'Cancelled. Nothing changed.',
  'accounts.outcome.wrongBinding':
    'Not connected: this account is for {{chosen}}. Connect again and choose {{expected}}.',
  'accounts.outcome.wrongPerson': 'Not connected: this {{source}} account is not yours. Connect again with your own.',
  'accounts.outcome.disconnected':
    'Disconnected. {{source}} may still list {{agent}} in your settings there: you can remove it.',
  'accounts.outcome.disconnectedRevoked': 'Disconnected',
  'accounts.unavailable': '{{source}} cannot be connected now. Try again later.',
  'accounts.notOffered': 'This account is not offered to you.',
  'accounts.changed': 'This account has changed. Open Your accounts again.',
  'accounts.disconnectConfirm': 'Disconnect {{source}}? {{agent}} deletes its access to your account.',
  'accounts.card.connect': 'Connect your {{account}} account to use {{feature}}.',
  // an account several sources use (package 3.5.10, UI-CONV-061, UI-CONV-063)
  'accounts.access.allowed': '{{source}}: allowed',
  'accounts.access.allowedInPart': '{{source}}: allowed in part',
  'accounts.access.missing': 'Not allowed: {{tools}}',
  'accounts.access.notAllowed': '{{source}}: not allowed',
  'accounts.allow': 'Allow',
  'accounts.allowMore': 'Allow more',
  'accounts.card.allow': 'Allow {{feature}} on your {{account}} account.',
  // the agent's key service did not answer (PROF-TOOL-032, UI-CONV-063)
  'accounts.outcome.unavailable':
    'Not connected: {{agent}} cannot keep your account just now. Try again in a few minutes.',
  'accounts.outcome.disconnectedNotTold':
    'Disconnected. {{agent}} could not tell {{source}}: remove its access in your settings there.',
  'accounts.empty': '{{agent}} offers you no account of your own to connect.',
  'accounts.noTab': 'The browser did not open a new tab. Allow pop-ups for this page and try again.',
  'tools.card.accountYours': 'With your account {{label}}',
  'tools.card.accountOwn': 'With your own account',
  'tools.card.accountRequester': "With {{requester}}'s own account",
  'tools.sources.personal': '{{source}}, your own account',
  'tools.sources.personalOf': "{{source}}, {{author}}'s own account",
  'tools.share.personal_one': '{{source}}, with your own account · {{count}} result',
  'tools.share.personal_other': '{{source}}, with your own account · {{count}} results',
  'tools.account.personal': 'Each person uses their own account',
  'tools.yourAccount.connected': 'Your account: connected',
  'tools.yourAccount.notConnected': 'Your account: not connected',
  'tools.accountPersonal': 'Each person connects their own account, in Your accounts.',
  'tools.useValue': 'Use {{value}}',
  'tools.connectToChoose': 'Connect your account to choose',
  'tools.notYourAccount': 'Choose one of your own accounts of {{source}}.',
  'conversation.withheldCredentialInfo':
    'This looked like a password or a key. {{agent}} did not keep it and did not show it to the AI.',
  'conversation.withheldCredentialAccounts': 'To connect an account, open Your accounts.',
} as const

export type ConnectionsCopyKey = keyof typeof CONNECTIONS_COPY
