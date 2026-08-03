
//Set up libraries
require('dotenv').config();
const { http, os, fs, path, express, expressLayouts, pool, session, PgStore } = require('./libs/requirements');
const app = express();

let host = "localhost";
let port = process.env.PORT || 3000;

//Get dymamic IP address
const networkInterfaces = os.networkInterfaces();

for(const iface of Object.values(networkInterfaces)){
  for(const ifaceInfo of iface){
    if(ifaceInfo.family === "IPv4" && !ifaceInfo.internal){
      host = ifaceInfo.address;
    };
  };
};

app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static('public'));
app.use(expressLayouts);
app.use(session({ //TODO: Change for HTTPS
  store: new PgStore({
    pool: pool
  }),
  secret: process.env.SESSION_SECRET || "super_secret_temp_key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set true when using HTTPS
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

app.use((req, res, next) => {
  res.locals.title = "FightLink"; // default title for all pages
  next();
});

app.get('/', (req, res) => res.redirect(301, '/home'));
app.use(express.json());
app.set("view engine", "ejs");

//----Using Routers----//

//API
const api_router = require('./routes/api_router');
app.use('/api', api_router);

//Home
const home_router = require('./routes/home_router');
app.use('/home', home_router);

//Authentication
const auth_router = require('./routes/auth_router');
app.use('/auth', auth_router);

//Athletes
const athletes_router = require('./routes/athletes_router');
app.use('/u', athletes_router);

//Error
app.use((req, res) => {
  res.status(404).render("error");
});

const http_server = http.createServer(app);

//Start up server
http_server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port} close it with CTRL + C`);
});
