const productService = require('../services/productService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const { Markup } = require('telegraf');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    // Handle product selection
    bot.action(/^product_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        await ctx.answerCbQuery();

        // Contact-only products → show contact info + Zalo link
        if (product.contact_only) {
            const buttons = [];
            const adminUsername = config.SUPPORT_CONTACT.replace('@', '');
            buttons.push([Markup.button.url('💬 Liên hệ mua', `https://t.me/${adminUsername}`)]);

            if (product.contact_url) {
                buttons.push([Markup.button.url('📱 Hotline Zalo 24/7', product.contact_url)]);
            }
            buttons.push([Markup.button.callback('↩️ Quay lại', 'refresh_products')]);

            return ctx.replyWithHTML(
                messages.contactOnly(product),
                Markup.inlineKeyboard(buttons)
            );
        }

        // Check stock (use display_stock which falls back to sheet_stock)
        const availableStock = product.display_stock || product.stock_count;
        if (availableStock === 0) {
            return ctx.reply(messages.noStock);
        }

        // --- KIỂM TRA SỐ DƯ ĐỂ ÁP DỤNG ĐIỀU KIỆN MUA TỐI THIỂU ---
        // Lấy thông tin user (tùy thuộc cơ chế của project, dùng findOrCreate hoặc getById)
        const user = await userService.findOrCreate(ctx.from);
        const userBalance = user.balance || 0;
        const minRequire = userBalance > 0 ? 1 : 10;

        // Lưu tạm thông tin vào Session để file quantitySelect.js có thể đọc lại
        ctx.session = ctx.session || {};
        ctx.session.buyContext = {
            productId: productId,
            minQuantity: minRequire,
            availableStock: availableStock,
            balance: userBalance
        };

        let noticeMsg = messages.selectQuantity(product) + `\n\n`;
        if (userBalance > 0) {
            noticeMsg += `👉 <i>Số dư của bạn > 0đ, bạn có thể nhập mua từ <b>1</b> cái trở lên.</i>\n`;
        } else {
            noticeMsg += `⚠️ <i>Số dư = 0đ, hệ thống yêu cầu mua tối thiểu từ <b>10</b> cái trở lên.</i>\n`;
        }
        noticeMsg += `\n⌨️ <b>Hãy nhập số lượng muốn mua vào ô tin nhắn:</b>`;

        // Kích hoạt ô nhập text (Force Reply) thay thế hoàn toàn bàn phím số cũ
        await ctx.replyWithHTML(noticeMsg, {
            reply_markup: {
                force_reply: true
            }
        });
    });
};
