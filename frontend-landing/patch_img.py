import os
import re

path = "/home/scarecrow/dev/booking_system/frontend-landing/src/app/page.tsx"

with open(path, "r") as f:
    content = f.read()

# Add import Image
if "import Image" not in content:
    content = 'import Image from "next/image";\n' + content

# Replace <img> tags with <Image fill unoptimized />
# Using regex to capture class, alt, and src
img_pattern = re.compile(r'<img\s+className="([^"]+)"\s+alt="([^"]+)"\s+src="([^"]+)"\s*/>')

def repl(match):
    cls = match.group(1)
    alt = match.group(2)
    src = match.group(3)
    return f'<Image src="{src}" alt="{alt}" className="{cls}" fill unoptimized />'

content = img_pattern.sub(repl, content)

with open(path, "w") as f:
    f.write(content)

print("Images replaced.")
