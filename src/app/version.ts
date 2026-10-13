/** Version of the application (from package.json at build time). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** A library that is a part of the application (from the installed packages at build time). */
export interface Library { name: string; version: string; license: string }
declare const __LIBRARIES__: Library[];
export const LIBRARIES: Library[] = typeof __LIBRARIES__ === 'object' ? __LIBRARIES__ : [];
