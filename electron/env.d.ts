declare namespace NodeJS {
  interface ProcessEnv {
    DIST: string
    VITE_PUBLIC: string
    VITE_DEV_SERVER_URL?: string
  }
}
