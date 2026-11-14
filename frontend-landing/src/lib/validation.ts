export function validatePasswordStrength(password: string): string | null {
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "Password must be at least 8 characters and include uppercase, lowercase, and a number.";
  }
  return null;
}
