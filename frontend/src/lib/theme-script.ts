/* Shared (server + client): the theme storage key and the pre-paint script. Kept out of the
   "use client" theme module so the server layout receives the real string, not a client reference. */
export const THEME_KEY = "prophet.theme";

/** Runs before paint (inlined in <head>): apply a stored choice so there's no flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;
