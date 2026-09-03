
//Set up libraries
const nodemailer = require("nodemailer");

//Configure shared transporter (Resend SMTP relay)
const mail_transporter = nodemailer.createTransport({
	host: "smtp.resend.com",
	port: 465,
	secure: true,
	auth: {
		user: "resend",
		pass: process.env.RESEND_API_KEY
	}
});

/**
 * Sends a transactional email through the shared Resend SMTP transporter. The only function
 * that touches nodemailer, so swapping providers means editing this one.
 * @param {object} params
 * @param {string} params.to - Recipient email address.
 * @param {string} params.subject - Email subject line.
 * @param {string} params.html - HTML email body.
 * @param {string} [params.text] - Plain-text fallback body.
 * @returns {Promise<object>} Result from nodemailer's sendMail.
 */
async function send_email({ to, subject, html, text }){
	return mail_transporter.sendMail({
		from: process.env.MAIL_FROM_ADDRESS,
		to,
		subject,
		html,
		text
	});
}

module.exports = {
	send_email
}