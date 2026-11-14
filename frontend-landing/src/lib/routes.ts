export function isWorkspaceRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/counselor/") ||
    pathname === "/counselor" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/account")
  );
}

export function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/counselor/setup"
  );
}

export function getDashboardPathForRole(role?: string | null): string {
  switch (role) {
    case "admin":
      return "/admin/dashboard";
    case "counselor":
      return "/counselor/dashboard";
    default:
      return "/dashboard";
  }
}

export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function getInitials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
