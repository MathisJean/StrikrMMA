
//Set up libraries
const nodemailer = require("nodemailer");

//----Email Authentication----//

async function email_auth(recipient, auth_code)
{
    sender_email = process.env.SENDER_EMAIL
    sender_pass = process.env.SENDER_PASS

    //Email body
    const html = 
    `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
            <div style="max-width: 500px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);">
                <h2 style="color: #333;">Hello ${recipient.first_name}!</h2>
                <p style="font-size: 16px; color: #555;">
                    Your verification code is:
                </p>
                <div style="font-size: 20px; font-weight: bold; color: #007BFF; padding: 10px; background: #f0f8ff; border-radius: 5px; display: inline-block;">
                    ${auth_code}
                </div>
                <p style="font-size: 14px; color: #777; margin-top: 20px;">
                    This code will expire in 3 minutes. If you didn't request this code, you can safely ignore this email.
                </p>
            </div>
        </div>
    `;

    const transporter = nodemailer.createTransport(
    {
        service: "gmail",
        auth: 
        {
            user: sender_email,
            pass: sender_pass
        },
    });

    try 
    {
        const info = await transporter.sendMail(
        {
            from: `"FightLink" <${sender_email}>`,
            to: recipient.email,
            subject: "FightLink email verification",
            html: html,
        });

        console.log("Authentication Email Sent: " + info.messageId);
    } 
    catch(error) 
    {
        console.error('Error sending email:', error);
    }
};

//Export function to server file
module.exports = email_auth;