// AppToolsPlugin.java: the small native helpers (share a file, permission
// status, open Android's page for a permission). Registered once, here.
import { registerPlugin } from '@capacitor/core';

export const AppTools = registerPlugin('AppTools');
