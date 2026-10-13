/** Version of the application (from package.json at build time). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
