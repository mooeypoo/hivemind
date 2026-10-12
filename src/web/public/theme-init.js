// Applies a saved Light/Dark choice before the first paint, so the page never flashes the other
// theme. Plain JavaScript on purpose: it must run, render-blocking, before the app's module
// loads. The key and values match src/web/composables/theme.ts (tested).
console.info(
  String.raw`       
▗▖ ▗▖▗▄▄▄▖▗▖   ▗▖    ▗▄▖     ▗▄▄▄▖▗▄▄▖ ▗▄▄▄▖▗▄▄▄▖▗▖  ▗▖▗▄▄▄ 
▐▌ ▐▌▐▌   ▐▌   ▐▌   ▐▌ ▐▌    ▐▌   ▐▌ ▐▌  █  ▐▌   ▐▛▚▖▐▌▐▌  █
▐▛▀▜▌▐▛▀▀▘▐▌   ▐▌   ▐▌ ▐▌    ▐▛▀▀▘▐▛▀▚▖  █  ▐▛▀▀▘▐▌ ▝▜▌▐▌  █
▐▌ ▐▌▐▙▄▄▖▐▙▄▄▖▐▙▄▄▖▝▚▄▞▘    ▐▌   ▐▌ ▐▌▗▄█▄▖▐▙▄▄▖▐▌  ▐▌▐▙▄▄▀
                                                            
I see you. You found the console. Now go make a list.

If you like tinkering with code, feel free to contribute!
See github repo @ https://github.com/mooeypoo/hivemind`,
);

try {
  const theme = localStorage.getItem('hivemind:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked: follow the system setting.
}
