const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    // Check if we have email credentials
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        console.log('📧 Email service initialized');
    } else {
        console.log('⚠️ Email credentials not configured. Emails will not be sent.');
    }

    return transporter;
}

function generateOrderEmail(order) {
    const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">×${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₦${(item.unitPrice * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif; background: #f5f3f0; padding: 20px; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="font-size: 2rem; font-weight: 800; color: #1a1a1e;">
            Mabite<span style="color: #e07c3c;">.</span>
          </div>
          <p style="color: #6b6b74; margin-top: 4px;">Premium Sharwama &amp; More</p>
        </div>

        <div style="background: #e6f7e6; color: #1a7a3a; padding: 16px 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 1.4rem;">✅ Order Confirmed!</h2>
          <p style="margin: 4px 0 0;">Thank you for your order</p>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 8px; font-size: 1.1rem;">Order #${order.orderNumber}</h3>
          <p style="margin: 0; color: #6b6b74; font-size: 0.9rem;">${new Date(order.createdAt).toLocaleString()}</p>
        </div>

        <div style="background: #faf8f5; padding: 16px 20px; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 0;"><strong>Name:</strong> ${order.customer.name}</p>
          <p style="margin: 4px 0 0;"><strong>Phone:</strong> ${order.customer.phone}</p>
          ${order.delivery?.isDelivery ? `<p style="margin: 4px 0 0;"><strong>Delivery Address:</strong> ${order.delivery.address || 'N/A'}</p>` : ''}
          <p style="margin: 4px 0 0;"><strong>Payment:</strong> ${order.payment?.method || 'N/A'}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #faf8f5;">
              <th style="padding: 10px 12px; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: #6b6b74;">Item</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 0.85rem; text-transform: uppercase; color: #6b6b74;">Qty</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 0.85rem; text-transform: uppercase; color: #6b6b74;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; border-top: 2px solid #f0ece6; padding-top: 16px;">
          <p style="margin: 4px 0; font-size: 0.95rem; color: #6b6b74;">
            Subtotal: ₦${order.subtotal.toLocaleString()}
          </p>
          ${order.delivery?.fee > 0 ? `<p style="margin: 4px 0; font-size: 0.95rem; color: #6b6b74;">Delivery: ₦${order.delivery.fee.toLocaleString()}</p>` : ''}
          <p style="margin: 8px 0 0; font-size: 1.4rem; font-weight: 800; color: #1a1a1e;">
            Total: ₦${order.total.toLocaleString()}
          </p>
        </div>

        <div style="text-align: center; margin-top: 24px; padding-top: 24px; border-top: 2px solid #f0ece6;">
          <p style="margin: 0; color: #6b6b74; font-size: 0.9rem;">
            Your order is being prepared.
            <br>
            Estimated preparation time: 15-25 minutes.
          </p>
        </div>

        <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0ece6; font-size: 0.8rem; color: #b0a89e;">
          <p style="margin: 0;">Mabite · Premium Sharwama &amp; More</p>
          <p style="margin: 4px 0 0;">Need help? Call us at +234 800 123 4567</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendOrderConfirmation(order, customerEmail) {
    try {
        const transporter = getTransporter();
        if (!transporter || !customerEmail) {
            console.log('📧 Email not sent - no transporter or email provided');
            return false;
        }

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Mabite <noreply@mabite.com>',
            to: customerEmail,
            subject: `Order Confirmed #${order.orderNumber} - Mabite`,
            html: generateOrderEmail(order),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent to ${customerEmail} for order ${order.orderNumber}`);
        return true;
    } catch (error) {
        console.error(`📧 Email error: ${error.message}`);
        return false;
    }
}

async function sendOrderStatusUpdate(order, customerEmail, newStatus) {
    try {
        const transporter = getTransporter();
        if (!transporter || !customerEmail) return false;

        const statusMessages = {
            confirmed: '✅ Your order has been confirmed and is being prepared.',
            preparing: '👨‍🍳 Your order is now being prepared by our chefs.',
            ready: '🔄 Your order is ready for pickup/delivery!',
            completed: '✅ Your order has been completed. Enjoy your meal!',
            cancelled: '❌ Your order has been cancelled.'
        };

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Mabite <noreply@mabite.com>',
            to: customerEmail,
            subject: `Order #${order.orderNumber} Status Update`,
            html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: Arial, sans-serif; background: #f5f3f0; padding: 20px; margin: 0;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 2rem; font-weight: 800; color: #1a1a1e;">
                Mabite<span style="color: #e07c3c;">.</span>
              </span>
            </div>
            <h2 style="text-align: center; color: #1a1a1e;">Order #${order.orderNumber}</h2>
            <div style="background: #faf8f5; padding: 16px 20px; border-radius: 12px; text-align: center;">
              <p style="margin: 0; font-size: 1.1rem; font-weight: 600; color: #1a1a1e;">
                Status: ${newStatus.toUpperCase()}
              </p>
              <p style="margin: 8px 0 0; color: #6b6b74;">
                ${statusMessages[newStatus] || 'Your order status has been updated.'}
              </p>
            </div>
            <div style="text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f0ece6; font-size: 0.8rem; color: #b0a89e;">
              <p style="margin: 0;">Mabite · Premium Sharwama</p>
            </div>
          </div>
        </body>
        </html>
      `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Status update email sent to ${customerEmail}`);
        return true;
    } catch (error) {
        console.error(`📧 Status email error: ${error.message}`);
        return false;
    }
}

module.exports = {
    sendOrderConfirmation,
    sendOrderStatusUpdate,
};