import os

base_dir = "/home/scarecrow/dev/booking_system/frontend-landing/src"

def patch_file(rel_path, replacements):
    path = os.path.join(base_dir, rel_path)
    with open(path, "r") as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(path, "w") as f:
        f.write(content)

# 1. DashboardLayout.tsx
patch_file("components/layout/DashboardLayout.tsx", [
    ("let navItems: any[] = [];", "let navItems: { name: string, path: string }[] = [];"),
    ("import { useEffect, useState, ReactNode } from \"react\";", "import { useState, ReactNode } from \"react\";"),
])

# 2. Availability Page
patch_file("app/counselor/availability/page.tsx", [
    ("import { useEffect, useState } from \"react\";", "import { useEffect, useState } from \"react\";\nimport { AvailabilityBlock } from \"@/types\";"),
    ("useState<any[]>([]);", "useState<AvailabilityBlock[]>([]);"),
    ("blocks.forEach((b: any) => {", "blocks.forEach((b: AvailabilityBlock) => {")
])

# 3. Bookings Page
patch_file("app/counselor/bookings/page.tsx", [
    ("import { useEffect, useState } from \"react\";", "import { useEffect, useState } from \"react\";\nimport { Booking } from \"@/types\";"),
    ("useState<any[]>([]);", "useState<Booking[]>([]);"),
    ("client's", "client&apos;s"),
    ("Let's", "Let&apos;s")
])

# 4. Profile Page
patch_file("app/counselor/profile/page.tsx", [
    ("import { useEffect, useState } from \"react\";", "import { useEffect, useState } from \"react\";\nimport { CounselorProfile } from \"@/types\";"),
    ("useState<any>(null);", "useState<CounselorProfile | null>(null);")
])

# 5. Login Page
patch_file("app/login/page.tsx", [
    ("} catch (err: any) {", "} catch (err: unknown) {")
])

# 6. Signup Page
patch_file("app/signup/page.tsx", [
    ("} catch (err: any) {", "} catch (err: unknown) {"),
    ("we'll", "we&apos;ll"),
    ("you'll", "you&apos;ll"),
    ("We'll", "We&apos;ll"),
    ("You'll", "You&apos;ll")
])

# 7. Contact Page
patch_file("app/contact/page.tsx", [
    ("We're", "We&apos;re"),
    ("Let's", "Let&apos;s"),
    ("we're", "we&apos;re"),
    ("let's", "let&apos;s")
])

# 8. Counselor Dashboard
patch_file("app/counselor/dashboard/page.tsx", [
    ("client's", "client&apos;s"),
    ("Let's", "Let&apos;s")
])

# 9. Dashboard Page
patch_file("app/dashboard/page.tsx", [
    ("counselor's", "counselor&apos;s"),
    ("Let's", "Let&apos;s")
])

# 10. Payment Success Page
patch_file("app/payment/success/page.tsx", [
    ("couldn't", "couldn&apos;t")
])

# 11. Protected Route
patch_file("components/auth/ProtectedRoute.tsx", [
    ("const { user, role, loading, error } = useAuth();", "const { role, loading, error } = useAuth();"),
    ("} catch (err) {", "} catch (_err) {")
])

print("Frontend TS and React entities patched.")
