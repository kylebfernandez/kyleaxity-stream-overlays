# KyleAxity Input Companion

A local input companion for League of Legends and VALORANT on Windows. Review your clicks, key presses, cursor paths and activity heatmaps after a match, or display live inputs in OBS.

## Features

- Separate League and Valorant keyboard layouts, with click, side-button and scroll indicators.
- League ability and summoner-spell icons from the local live-game API.
- Manual Valorant agent selection with C/Q/E/X ability icons.
- Raw mouse movement for Valorant, including when the game locks the cursor.
- Match input totals, key counts, sampled cursor paths and activity heatmaps.
- League-only cursor trail. No trail is drawn in Valorant.

## Setup

Requires Windows 10/11, Node.js 20 or newer, npm, OBS Studio and the .NET Framework C# compiler included with Windows.

```powershell
npm install
npm run setup
npm start
```

Keep the helper running while playing. Open [controls](http://127.0.0.1:17843/control) to choose an agent or toggle the overlay. Match review is at [review.html](http://127.0.0.1:17843/review.html).

Setup builds the native helpers and downloads game artwork. The source does not require MicroLab. Runtime data and downloaded artwork are ignored by Git. Run only one copy of the helper on the default port.

To run the helper automatically at sign-in without a console window:

```powershell
powershell -NoProfile -File scripts/install-startup.ps1
```

This creates a scheduled task named **KyleAxity Stream Overlays** for the current user. Keep the project folder in place. You can stop or disable that task in Windows Task Scheduler.

## OBS sources

Add these as Browser Sources in the corresponding game scene. Enable **Shutdown source when not visible**.

| Scene                      | URL                                                  | Size        | Suggested FPS |
| -------------------------- | ---------------------------------------------------- | ----------- | ------------- |
| League keyboard/mouse      | `http://127.0.0.1:17843/keyboard.html?only=league`   | 478 x 152   | 30            |
| League mouse trail         | `http://127.0.0.1:17843/overlay.html`                | 1920 x 1080 | 60            |
| League post-game summary   | `http://127.0.0.1:17843/postgame.html?only=league`   | 1920 x 1080 | 30            |
| Valorant keyboard/mouse    | `http://127.0.0.1:17843/keyboard.html?only=valorant` | 530 x 240   | 60            |
| Valorant post-game summary | `http://127.0.0.1:17843/postgame.html?only=valorant` | 1920 x 1080 | 30            |

Keep each game's sources in its own scene. Resize proportionally in OBS. The keyboard panel appears when that game is focused. Enter keeps the panel visible while suppressing typed-chat key indicators and counts. Ctrl+Shift+F9 toggles the input overlays.

## Agent icons and settings

Choose the agent on the controls page whenever you switch agents. Selection is manual, not automatically detected. Icons follow default C/Q/E/X bindings; no cooldowns are shown.

`game-settings.json` controls which games are enabled. Desktop summaries are opt-in with `desktop: true`; live inputs remain OBS-only unless `desktopTrail` is enabled. The defaults disable the Valorant cursor trail and desktop display.

## Data and limitations

The server listens only on `127.0.0.1:17843`. Match data stays on the PC in `match-summaries.json`, replacing the previous saved match for that game. It stores aggregate input counts, a bounded sampled cursor path and coarse activity/click grids. It does not save typed text, an ordered keystroke log or raw aiming deltas.

Counts are physical inputs, not confirmed casts. Held-key repeats are excluded. Cursor paths show screen coordinates, not locations on the game map. Valorant aim movement drives the mouse illustration only; its post-game cursor map is limited by the locked screen cursor. Agent, KDA and win/loss are not inferred for Valorant. League match details depend on its local API. Joining mid-match produces a partial capture.

The helper observes Windows input and reads local game status. It does not inject input or read game memory. This is an independent community tool, not an approved Riot application; no anti-cheat approval is claimed.

## Development

```powershell
npm test
npm run build
```

Web pages and the Node server are in the project root. Windows helper sources are in `native/`. Do not commit local match files, cached artwork or compiled binaries.

## Legal and privacy

This is a free, independent community project. OBS displays are one feature; the companion also collects local match input statistics and provides post-game review.

See [Privacy](PRIVACY.md), [Terms of use](TERMS.md) and [third-party notices](NOTICE). Riot artwork is not covered by the source code's MIT license.

KyleAxity Input Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Riot's [Legal Jibber Jabber](https://www.riotgames.com/en/legal) describes its fan-content rules. Its [developer policies](https://developer.riotgames.com/policies/general) separately require product registration and review. These notices do not establish registration, permission to distribute game assets, or anti-cheat approval. Those requirements must be resolved through Riot's Developer Portal before treating this as an approved public integration.

## Credits

Input events use [uiohook-napi](https://github.com/SnosMe/uiohook-napi). League artwork and metadata use Riot Data Dragon. Valorant artwork metadata is provided by [Valorant-API](https://valorant-api.com/). See [NOTICE](NOTICE) for third-party rights.
