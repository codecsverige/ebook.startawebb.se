// Shared by the header and editor; the editor can cancel navigation while dirty.
export function allowStudioNavigation(): boolean {
  return window.dispatchEvent(
    new Event("ebook:before-navigation", { cancelable: true }),
  );
}
