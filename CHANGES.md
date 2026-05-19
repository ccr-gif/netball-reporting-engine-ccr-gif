# Netball Coach App — v2.0 Rebuilt

## What changed

### 🐛 Bugs fixed
- **`normalizeMatchConfig` mutation bug** — config was using `const` inside a loop causing silent failures on save. Now correctly uses `let` with proper deduplication.
- **Stray backtick in `statLabels.ts`** — invalid TypeScript at end of file, now removed.

### 🗑️ Dead code removed
- `src/navigation/nav.ts` — unused navigation helper
- `src/components/Court.tsx` — imported nowhere
- `src/screens/MatchCenterScreen.tsx` — unused wrapper
- All commented-out code blocks in `MatchCenter`

### ♻️ Refactored (less duplication)
- `src/hooks/useReportData.ts` — **new shared hook** that replaces ~400 lines of duplicated logic that previously existed separately in both `Reports.tsx` and `HistoryReports.tsx`. Both screens now use this single source of truth.
- `src/hooks/useReportData.ts` also exports `buildHtml()` and `buildCsv()` — shared by both report screens.

### 🌙 Dark mode
- `src/context/ThemeContext.tsx` — new context provider with `system / light / dark` modes
- `src/theme.ts` — exports `lightTheme` and `darkTheme`
- All screens use `useTheme()` — full dark mode support throughout
- Settings screen lets user pick their preferred mode

### ⚡ New features
| Feature | Where |
|---|---|
| Quarter timer (start/stop/reset) | MatchCenter top bar |
| Timer expiry → alert to advance quarter | MatchCenter |
| Live quarter dot indicator | Quarter selector tabs |
| Unfilled lineup position → amber highlight | Player grid tiles |
| Last stat flashed under active position | Player grid tiles |
| Tap player name → see running Q stats | Long-press tile |
| Undo toast ("Last stat undone ↩") | After any undo |
| Stat recorded toast ("Goal recorded") | After any stat tap |
| Substitution history log | 📋 Subs button in MatchCenter |
| Share button (Share sheet) | Reports + HistoryReports |
| Pre-match notes / game plan | MatchSetup notes field |
| Auto-save match config as new default | After each match created |
| Match status badge (Complete / In Progress) | HistoryReports list |
| Settings screen | New tab |
| Offline banner | Top of screen when no network |

## Setup

```bash
# Install dependencies (same as before — no new packages needed beyond what was already in package.json)
npm install

# Start
npx expo start
```

## File structure

```
App.tsx                          ← clean root, ThemeProvider, OfflineBanner
src/
  context/
    ThemeContext.tsx              ← dark mode context (NEW)
  hooks/
    useReportData.ts             ← shared report data hook (NEW — replaces duplicate code)
  navigation/
    AppNavigator.tsx             ← single clean navigator
  screens/
    MatchSetup.tsx               ← + notes field, auto-save default config
    MatchCenter.tsx              ← + timer, toast, stats modal, sub history
    Players.tsx                  ← dark mode, same functionality
    Reports.tsx                  ← simplified (uses shared hook)
    HistoryReports.tsx           ← + status badge, match picker (uses shared hook)
    Settings.tsx                 ← NEW — dark mode picker
    LineupModal.tsx              ← unchanged
    PlayerEditModal.tsx          ← unchanged
  components/
    ui.tsx                       ← NEW — FlashButton, Toast, OfflineBanner, Card, Btn
    EmailPrompt.tsx              ← unchanged
    MatchStatPicker.tsx          ← unchanged
    StatLibraryManager.tsx       ← unchanged
  storage/
    db.ts                        ← unchanged
    repository.ts                ← unchanged
    matchConfig.ts               ← FIXED mutation bug + auto-default helpers
    customStats.ts               ← unchanged
    customStatTallies.ts         ← unchanged
    reportOutbox.ts              ← unchanged
    uploadReport.ts              ← unchanged
    statLabels.ts                ← FIXED stray backtick
  theme.ts                       ← + lightTheme / darkTheme exports
  types/
    stats.ts                     ← unchanged
  lib/
    supabase.ts                  ← unchanged
```
