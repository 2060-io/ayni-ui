/**
 * The English wording of spaces, memories and deletion (UI-CONV-028..043), written once for the browser and the Ayni
 * app: the browser's English translation file must say the same (a test compares them), and the app starts from these.
 * Keys are paths in the translation file; `{{name}}` marks what the screen puts in.
 */
export const SPACES_COPY = {
  'spaces.personal': 'Personal',
  'spaces.chipKept_other': 'kept {{count}} days',
  'spaces.in': 'In',
  'spaces.onlyYouRead': 'Only you can read these',
  'spaces.sharedWithSpace': 'Shared with the space',
  'spaces.onlyYouSee': 'Only you see these',
  'spaces.managers': 'Managers do not see your conversations, and your memories here are yours alone.',
  'spaces.left': 'You are no longer in {{space}}',
  'spaces.writesIn': '{{agent}} writes for this space in {{language}}',
  'spaces.sharedTag': 'Shared with {{space}}',
  'spaces.share': 'Share with {{space}}',
  'spaces.stopSharing': 'Stop sharing',
  'spaces.newSpace': 'New space',
  'spaces.basis.contract': 'a contract with you',
  'spaces.basis.consent': 'your consent',
  'spaces.basis.legitimateInterest': "the organization's legitimate interest",
  'memories.updated': '{{agent}} updated a memory',
  'memories.changeMemory': 'To change it, tell {{agent}} in a conversation of {{space}}',
  'memories.changePreference': 'To change it, tell {{agent}} in any conversation',
  'memories.usedInSpace_other': '{{count}} memories of yours in {{space}}',
  'memories.usedPreferences_one': '{{count}} preference',
  'keeps.title': 'What {{agent}} keeps about you',
  'keeps.usedEverywhere': 'Used in every space',
  'conversation.delete': 'Delete',
} as const

export type SpacesCopyKey = keyof typeof SPACES_COPY
