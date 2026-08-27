const twilio = require('twilio');

let client = null;

function getTwilioClient() {
    if (client) return client;

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        console.log('📱 SMS service initialized');
    } else {
        console.log('⚠️ Twilio credentials not configured. SMS will not be sent.');
    }

    return client;
}

async function sendSMS(to, message) {
    try {
        const twilioClient = getTwilioClient();
        if (!twilioClient) {
            console.log('📱 SMS not sent - no Twilio client');
            return false;
        }

        const result = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to,
        });

        console.log(`📱 SMS sent to ${to}: ${result.sid}`);
        return true;
    } catch (error) {
        console.error(`📱 SMS error: ${error.message}`);
        return false;
    }
}

async function sendOrderConfirmationSMS(order) {
    const message = `
✅ Mabite: Order #${order.orderNumber} confirmed!
Total: ₦${order.total.toLocaleString()}
Est. ready: 15-25 min
Thank you!
  `.trim();

    return sendSMS(order.customer.phone, message);
}

async function sendOrderStatusSMS(order, newStatus) {
    const statusMessages = {
        confirmed: `✅ Order #${order.orderNumber} confirmed! Being prepared.`,
        preparing: `👨‍🍳 Order #${order.orderNumber} is being prepared.`,
        ready: `🔄 Order #${order.orderNumber} is ready for pickup/delivery!`,
        completed: `✅ Order #${order.orderNumber} completed. Enjoy!`,
        cancelled: `❌ Order #${order.orderNumber} cancelled.`
    };

    return sendSMS(order.customer.phone, statusMessages[newStatus] || `Order #${order.orderNumber} status: ${newStatus}`);
}

module.exports = {
    sendSMS,
    sendOrderConfirmationSMS,
    sendOrderStatusSMS,
};