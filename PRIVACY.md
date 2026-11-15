# Privacy

KyleAxity Input Companion runs locally on Windows. No account or hosted analytics service is provided by this project.

The helper observes Windows keyboard and mouse events to display supported game inputs. It uses local League game status and Valorant log entries to identify sessions. It saves aggregate counts, a bounded sample of cursor positions and coarse activity/click grids in `match-summaries.json`, keeping the latest summary per game. League summaries can include details supplied by its local game API.

Typed text, an ordered keystroke history and raw aiming deltas are not saved. Chat suppression depends on recognizing the game's chat state; do not treat it as a general-purpose privacy filter for every application. Settings and manual agent selection are saved locally. The server binds to `127.0.0.1`.

Setup and artwork loading contact Riot Data Dragon and Valorant-API artwork services. Those services receive normal network request information, such as your IP address. Input statistics are not sent to those services by this code. npm also contacts its package registry during installation.

OBS captures whatever sources you enable. If you stream or record the displays or summaries, those inputs and statistics become visible to your audience or in the recording.

To remove saved match statistics, stop the helper and delete `match-summaries.json` in the project folder. To stop collection, stop the helper and disable its startup task if installed. Deleting the project does not delete copies you have recorded, streamed or shared.
