export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

// Session expired / logged out — reload so the app's auth gate shows the login screen.
export function redirectToLogin(toast?: (options: { title: string; description: string; variant: string }) => void) {
  if (toast) {
    toast({
      title: "Logged out",
      description: "Your session ended. Please log in again.",
      variant: "destructive",
    });
  }
  setTimeout(() => {
    window.location.reload();
  }, 500);
}
