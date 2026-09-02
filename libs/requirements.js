
//Set up libraries
const http = require('http');
const os = require('os');

const fs = require('fs');
const path = require('path');

const express = require('express');
const expressLayouts = require("express-ejs-layouts");

const pool = require('./db');

const bcrypt = require('bcrypt');

const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const user_session = require('./middleware/user_session.js');

const mailer = require('./token.js');

const { upload_cloudinary_image, delete_cloudinary_image } = require('./cloudinary.js');

const errors = require('./errors.js');
const logger = require('./logger.js');
const validation = require('./validation.js');

const { require_admin, require_login, require_guest } = require('./middleware/permissions.js')

//Export everything you want to reuse
module.exports = {
	//General
	http,
	os,
	fs,
	path,

	//Express
	express,
	expressLayouts,

	//Database
	pool,

	//Cryptography
	bcrypt,

	//Session
	session,
	PgStore,
	user_session,

	//Email
	mailer,

	//Image Upload
	upload_cloudinary_image,
	delete_cloudinary_image,

	//Errors
	errors,
	logger,

	//Validation
	validation,

	//Permissions
	require_admin,
	require_login,
	require_guest
};