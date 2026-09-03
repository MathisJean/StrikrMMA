
//Set up libraries
require('dotenv').config();
const { http, os, path, express, expressLayouts, pool, session, PgStore, user_session, require_onboarding, mailer, logger } = require('./libs/requirements');
const { not_found_handler, error_handler } = require('./libs/middleware/error_handler');
const app = express();

//Sessions are the only thing standing between a cookie and someone's account. A default
//secret would sign them with a value anyone reading this repository already knows, so
//refusing to start is the only safe response to a missing one.
if(!process.env.SESSION_SECRET){
	throw new Error("SESSION_SECRET environment variable is required — refusing to start with an insecure default.");
}

let port = process.env.PORT || 3000;

/**
 * Finds the machine's LAN address, so the startup line can be opened from a phone on the
 * same network. Only used for display — the server binds to every interface.
 * @returns {string} The first non-internal IPv4 address, or "localhost" if there is none.
 */
function get_lan_address(){
	for(const iface of Object.values(os.networkInterfaces())){
		for(const iface_info of iface){
			if(iface_info.family === "IPv4" && !iface_info.internal){
				return iface_info.address;
			}
		}
	}

	return "localhost";
}

const lan_address = get_lan_address();

//Behind Caddy every request arrives from the proxy, so without this req.ip is the proxy's
//address for everybody and the rate limiters share one bucket across all users. Only in
//production — trusting a forwarded header locally would let anyone spoof their own IP.
if(process.env.NODE_ENV === "production"){
	app.set("trust proxy", 1);
}

app.use(express.urlencoded({ limit: "10mb", extended: true }));

//__dirname-relative, not cwd-relative: starting the server from any other directory
//used to serve no static files and find no views.
app.use(express.static(path.join(__dirname, 'public')));
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.use(session({
	store: new PgStore({
		pool: pool,
		createTableIfMissing: true
	}),
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		//30 days. Athletes log in a few times a year, so a short session would mean a
		//magic-link round trip almost every visit. `secure` above only means anything once
		//HTTPS is actually live in front of this — that is what this length leans on.
		maxAge: 1000 * 60 * 60 * 24 * 30
	}
}));

const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${port}`;

app.use((req, res, next) => {
	res.locals.title = "The link in bio for fighters"; // default title for all pages

	//Social-preview defaults. Pages that describe something specific (an athlete profile)
	//can override these in their own view.
	res.locals.base_url = BASE_URL;
	res.locals.canonical_url = `${BASE_URL}${req.originalUrl.split("?")[0]}`;
	res.locals.og_image = `${BASE_URL}/logo/strikr_logo_no_margin.png`;
	res.locals.og_description = "The Link in Bio Made for Combat Athletes";

	next();
});

app.use(user_session);

app.get('/', (req, res) => res.redirect(301, '/home'));
app.use(express.json());
app.set("view engine", "ejs");

//Runs after user_session, which is what puts onboarding_complete on res.locals.user. An
//account created by a magic link has no username, corner, profile or record until it
//finishes onboarding, so every other page would be reading fields that do not exist yet.
app.use(require_onboarding);

//----Routers----//

//API
const api_router = require('./routes/api_router');
app.use('/api', api_router);

//Home
const home_router = require('./routes/home_router');
app.use('/home', home_router);

//Authentication
const auth_router = require('./routes/auth_router');
app.use('/auth', auth_router);

//Onboarding
const onboarding_router = require('./routes/onboarding_router');
app.use('/onboarding', onboarding_router);

//Account
const account_router = require('./routes/account_router');
app.use('/account', account_router);

//Athletes
const athletes_router = require('./routes/athletes_router');
app.use('/u', athletes_router);

//Admin
const admin_router = require('./routes/admin_router');
app.use('/admin', admin_router);

//Profile Claiming
const claim_router = require('./routes/claim_router');
app.use('/claim', claim_router);

//Reports
const report_router = require('./routes/report_router');
app.use('/report', report_router);

//Error
app.use(not_found_handler);
app.use(error_handler);

//-- Locals --//
app.locals.calculate_age = (date) => {
    if(!date) return null;

    const diff = Date.now() - new Date(date).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

app.locals.calculate_height = (total_inches) => {
    if(!total_inches) return null;

    const feet = Math.floor(total_inches / 12);
    const inches = total_inches % 12;

    return `${feet}'${inches}"`;
}

app.locals.calculate_year = (date) => {
    if(!date) return null;

	const raw_date = new Date(date);
    return raw_date.getFullYear();;
}

//-- Scheduled Jobs --//

//TODO: Convert to Cron job infrastructure
const TOKEN_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; //24 hours

mailer.cleanup_expired_tokens().catch(err => logger.error("Token cleanup failed", err));
setInterval(() => {
	mailer.cleanup_expired_tokens().catch(err => logger.error("Token cleanup failed", err));
}, TOKEN_CLEANUP_INTERVAL_MS);

const http_server = http.createServer(app);

//Start up server. Binding every interface rather than only the LAN address keeps
//http://localhost working alongside access from other devices on the network.
http_server.listen(port, () => {
	logger.info(`Server running at http://localhost:${port} (LAN: http://${lan_address}:${port}) close it with CTRL + C`);
});
