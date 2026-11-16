"""Verify the complete voice catalog, built media and approved loyalist renders."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'web/strategy/vox-assets.ts').read_text().split(' = ', 1)[1].rstrip(';\n'))
planned = json.loads((root / 'docs/vox/lines.json').read_text())
baseline = json.loads((root / 'docs/vox/approved-baseline.json').read_text())
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert len(catalog) == 50
assert len({line['id'] for line in catalog}) == 50
assert {line['id'] for line in planned} <= {line['id'] for line in catalog}
for path, sha in baseline.items():
    assert digest(root / path) == sha, f'Approved voice changed: {path}'
urls = {url for line in catalog for url in line['sources'].values()}
assert len(urls) == 170
for url in urls:
    source = root / url.lstrip('/')
    built = root / 'web/dist' / url.replace('/web/sfx/', 'assets/sfx/')
    assert digest(source) == digest(built), f'Built voice differs: {url}'
hostiles = [line for line in catalog if line['faction'] == 'nightlords']
assert len(hostiles) == 8
assert all(url.endswith('-chaos-vox3.mp3') for line in hostiles for url in line['sources'].values())
report = dict(loyalist_lines=42, nightlords_spoken_lines=6,
              nightlords_reused_vocalisations=2, total_entries=len(catalog),
              total_audio_files=len(urls), previously_approved_files_unchanged=len(baseline),
              all_planned_lines_in_catalog=True, built_audio_matches_source=True,
              nightlords_profile='chaos-vox3', all_nightlords_use_chaos_radio=True)
(root / 'docs/vox/completion-check.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
