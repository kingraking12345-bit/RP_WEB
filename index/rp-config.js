/* RP backend switch.
   "postgres" = the real shared database, reached through the RP API (the server/ folder, hosted on Render).
   "local"    = no server at all. Everything runs inside this browser (localStorage) for building and testing.
   Open any page with ?backend=local or ?backend=postgres to try the other one in this browser (it is remembered per browser). */
window.RP_BACKEND = "postgres";

/* The address of your hosted API, with no trailing slash. Example: "https://rp-api.onrender.com"
   While testing on your own computer use "http://localhost:3000". */
window.RP_API_URL = "https://rp-api-3bj1.onrender.com";
