// Browser-compatible Resource Loader
// Simplified version for MVP - no dynamic file loading

export const ResLoader = {
  get: function (url: string, cb: (arg0: any) => void, async?: boolean) {
    // For browser, we'll inline the data or use fetch
    // For MVP, return empty data - syntax data will be built-in
    cb({});
  },
  getBundle: function (locale: string): string {
    // Return empty bundle for MVP - no i18n support
    return "";
  },
};
