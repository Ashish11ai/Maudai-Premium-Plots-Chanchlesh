# Debug Session: layout-wall-placement
- **Status**: [OPEN]
- **Issue**: Layout boundary wall does not follow the red perimeter from the layout image and does not properly enclose the full site on the satellite view.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-layout-wall-placement.ndjson

## Reproduction Steps
1. Start the site locally.
2. Open the customer view in the browser.
3. Inspect the satellite layout overlay and compare the rendered wall against the red boundary shown in the layout image.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The wall segment coordinates are wrong and do not match the intended red perimeter corners. | High | Low | Confirmed |
| B | The wall coordinates are correct locally, but map placement transform differs from the plot transform. | High | Medium | Rejected |
| C | The renderer is missing corner points, so the wall cuts across the site instead of wrapping it. | High | Low | Confirmed |
| D | Plots and walls are being read from different coordinate sources. | Medium | Low | Rejected |
| E | Segment ordering works in one view but produces an invalid perimeter path in the satellite view. | Medium | Medium | Partially confirmed |

## Log Evidence
- Pre-fix evidence showed the wall used an insufficient lower perimeter and visually cut across the lower plot cluster instead of enclosing it.
- Post-fix log line 17 confirms the new wall path is a different 11-segment perimeter with a lower eastern reach: first `[-19.4, -21.8, -12.4, -32]`, middle `[21.5, 16.5, 28.6, 21.9]`, last `[-19.4, 13.7, -19.4, -21.8]`.
- Post-fix log lines 18-20 show those wall segments transformed successfully on the same map projection as the plot overlay.
- Post-fix log line 21 shows Plot 1 still transforms correctly under the same placement settings, confirming the fix did not change the plot coordinate system.
- Post-fix log line 16 confirms the placement transform remains the same (`scale: 11`, same lat/lng anchor), so the defect was in the wall path rather than the map transform.

## Verification Conclusion
- Root cause: the previous perimeter coordinates were too shallow across the lower half of the site, leaving the bottom plot band outside the covered wall.
- Fix applied: replaced `SITE_WALL_SEGMENTS` with a wider enclosing perimeter that follows the intended red boundary shape around the full layout while keeping the same map placement transform.
- Awaiting user visual confirmation before cleanup. Instrumentation and debug server remain active.
