import re

with open(r'C:\Users\Arman\Documents\GeauxDrafterPrivate\templates\ClientFPOA_extracted\word\document.xml', 'r', encoding='utf-8') as f:
    content = f.read()

# Find Section IV area
idx = content.find('EFFECTIVE DATE')
if idx > 0:
    start = max(0, idx - 500)
    end = min(len(content), idx + 15000)
    section = content[start:end]

    # Make it more readable by adding newlines
    section = section.replace('><', '>\n<')
    print(section)
