const productService = require('../services/productService');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const { Markup } = require('telegraf');
const { formatPrice } = require('../utils/keyboard');

// Bộ nhớ tạm lưu trữ trạng thái người dùng đang chuẩn bị mua sản phẩm gì
const awaitingQuantity = new Map();

module.exports = (bot) => {
    // 1. Kích hoạt nhập số lượng bằng ô input (Force Reply) khi bấm nút mua sản phẩm
    // Pattern callback giả định từ nút mua: buy_{productId}
    bot.action(/^buy_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock <= 0) {
            return ctx.answerCbQuery('❌ Sản phẩm đã hết hàng');
        }

        // Lấy thông tin user để kiểm tra số dư
        const user = userService.findOrCreate(ctx.from);
        const userBalance = user.balance || 0;

        // Xác định điều kiện mua tối thiểu
        // Nếu số dư > 0đ, min là 1. Nếu tài khoản không có tiền (hoặc <= 0), min là 10.
        const minQuantity = userBalance > 0 ? 1 : 10;

        // Lưu tạm thông tin vào bộ nhớ
        awaitingQuantity.set(ctx.from.id, {
            productId: productId,
            productName: product.name,
            availableStock: availableStock,
            price: product.price,
            minQuantity: minQuantity,
            userBalance: userBalance
        });

        await ctx.answerCbQuery();
        
        let noticeMsg = `📦 <b>${product.name}</b>\n` +
                        `📊 Tồn kho: ${availableStock} sản phẩm\n` +
                        `💰 Số dư tài khoản: <b>${formatPrice(userBalance)}</b>\n\n`;

        if (userBalance > 0) {
            noticeMsg += `👉 <i>Số dư của bạn > 0đ, bạn có thể mua từ 1 cái trở lên.</i>\n`;
        } else {
            noticeMsg += `⚠️ <i>Số dư của bạn = 0đ, hệ thống yêu cầu mua tối thiểu từ <b>10 cái</b> trở lên.</i>\n`;
        }

        noticeMsg += `\n⌨️ <b>Vui lòng nhập số lượng muốn mua vào ô tin nhắn:</b>`;

        await ctx.replyWithHTML(noticeMsg, {
            reply_markup: {
                force_reply: true
            }
        });
    });

    // 2. Lắng nghe tin nhắn văn bản (text) phản hồi lại câu hỏi của bot
    bot.on('text', async (ctx) => {
        // Bỏ qua nếu không phải là tin nhắn trả lời (reply) đúng ngữ cảnh chọn số lượng
        if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.text.includes('Vui lòng nhập số lượng muốn mua vào ô tin nhắn:')) {
            return; 
        }

        const userId = ctx.from.id;
        const sessionData = awaitingQuantity.get(userId);

        if (!sessionData) {
            return ctx.reply('⚠️ Phiên giao dịch đã hết hạn. Vui lòng bấm chọn lại sản phẩm.');
        }

        const quantity = parseInt(ctx.message.text);

        // Kiểm tra tính hợp lệ của số lượng nhập vào
        if (isNaN(quantity) || quantity <= 0) {
            return ctx.reply('⚠️ Số lượng không hợp lệ. Vui lòng nhập một số nguyên lớn hơn 0.');
        }

        // Kiểm tra điều kiện số lượng tối thiểu dựa trên số dư lúc bấm nút
        if (quantity < sessionData.minQuantity) {
            return ctx.reply(`⚠️ Bạn cần mua tối thiểu từ <b>${sessionData.minQuantity}</b> sản phẩm trở lên vì số dư hiện tại của bạn là <b>${formatPrice(sessionData.userBalance)}</b>.`, { parse_mode: 'HTML' });
        }

        // Kiểm tra giới hạn kho
        if (quantity > sessionData.availableStock) {
            return ctx.reply(`⚠️ Số lượng vượt quá tồn kho hiện tại (chỉ còn ${sessionData.availableStock} sản phẩm).`);
        }

        // Hoàn tất xử lý, xóa bộ nhớ tạm
        awaitingQuantity.delete(userId);

        const product = productService.getById(sessionData.productId);
        const banks = paymentService.getBanks();

        if (banks.length > 1) {
            // Nhiều ngân hàng -> Hiển thị chọn ngân hàng
            const totalPrice = product.price * quantity;
            const bankButtons = banks.map((b, i) =>
                [Markup.button.callback(`🏦 ${b.NAME}`, `bank_${product.id}_${quantity}_${i}`)]
            );
            bankButtons.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

            await ctx.replyWithHTML(
                `📦 <b>${product.name}</b>\n` +
                `📊 Số lượng: ${quantity}\n` +
                `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
                `🏦 Chọn ngân hàng thanh toán:`,
                Markup.inlineKeyboard(bankButtons)
            );
        } else {
            // 1 ngân hàng -> Tạo đơn trực tiếp
            await ctx.reply('⏳ Đang tạo đơn hàng...');
            await createOrderAndPay(ctx, bot, product, quantity, 0);
        }
    });

    // Xử lý chọn ngân hàng: bank_{productId}_{quantity}_{bankIndex}
    bot.action(/^bank_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const bankIndex = parseInt(ctx.match[3]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        await ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
        await createOrderAndPay(ctx, bot, product, quantity, bankIndex);
    });

    // ════════════════════════════════════
    // Shared: Create order + send QR generation + Admin notification
    // ════════════════════════════════════
    async function createOrderAndPay(ctx, bot, product, quantity, bankIndex) {
        userService.findOrCreate(ctx.from);

        const totalPrice = product.price * quantity;
        const payment = paymentService.generatePayment(totalPrice, bankIndex);

        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            totalPrice,
            payment.paymentCode
        );

        // 1. Gửi QR code cho khách hàng
        const caption =
            `⏳ <b>Đang chờ thanh toán ${formatPrice(totalPrice)}...</b>\n\n` +
            `Quét mã QR phía trên để chuyển khoản.\n\n` +
            `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
            `📦 Sản phẩm: ${product.name}\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
            `━━━━━━━━━━━━━━━━━\n\n` +
            `🏦 Quét mã QR để chuyển khoản\n` +
            `├ Số tiền: <b>${formatPrice(totalPrice)}</b>\n` +
            `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
            `⏰ QR hiệu lực trong <b>15 phút</b>\n` +
            `🚫 <b>KHÔNG</b> thay đổi nội dung chuyển khoản\n` +
            `✅ Sau khi CK thành công, hàng sẽ được\ngiao <b>tự động</b> trong vòng dưới 60 giây`;

        await ctx.replyWithPhoto(payment.qrUrl, {
            caption,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Hủy thanh toán', `cancel_order_${order.id}`)],
            ]),
        });

        // 2. Thông báo cho Admin
        const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
        const adminMsg =
            `🔔 <b>ĐƠN HÀNG MỚI #${order.id}</b>\n\n` +
            `👤 Khách: <b>${userName}</b> (<code>${ctx.from.id}</code>)\n` +
            (ctx.from.username ? `📱 @${ctx.from.username}\n` : '') +
            `\n` +
            `📦 Sản phẩm: <b>${product.name}</b>\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💰 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n` +
            `🏦 Bank: <b>${payment.bankName}</b>\n` +
            `🔑 Mã CK: <code>${payment.paymentCode}</code>\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ Xác nhận & giao hàng:\n` +
            `<code>/confirm ${order.id}</code>`;

        try {
            await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`✅ Xác nhận #${order.id}`, `admin_confirm_${order.id}`),
                        Markup.button.callback(`❌ Hủy #${order.id}`, `admin_cancel_${order.id}`),
                    ],
                ]),
            });
        } catch (err) {
            console.error('Failed to notify admin:', err.message);
        }
    }

    // Xử lý tác vụ nhanh của Admin trên thông báo đơn hàng
    bot.action(/^admin_confirm_(\d+)$/, async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return ctx.answerCbQuery('⛔');

        const orderId = parseInt(ctx.match[1]);
        const order = orderService.getById(orderId);
        if (!order) return ctx.answerCbQuery('❌ Đơn hàng không tồn tại');
        if (order.status !== 'pending') return ctx.answerCbQuery('⚠️ Đơn đã xử lý');

        const product = productService.getById(order.product_id);
        const realStock = productService.getAvailableStock(order.product_id, order.quantity);

        if (realStock.length >= order.quantity) {
            ctx.answerCbQuery('⏳ Đang xử lý...');
            const { deliverOrder } = require('./paymentConfirm');
            const result = await deliverOrder(bot, orderId);

            if (result.success) {
                await ctx.editMessageText(
                    ctx.callbackQuery.message.text + '\n\n✅ ĐÃ XÁC NHẬN & GIAO HÀNG TỰ ĐỘNG!',
                    { parse_mode: 'HTML' }
                );
            } else {
                await ctx.reply(`❌ Lỗi đơn #${orderId}: ${result.error}`);
            }
        } else {
            ctx.answerCbQuery('📝 Cần cung cấp tài khoản...');
            orderService.markPaid(orderId);

            const { setAdminState } = require('./adminActions');
            setAdminState(ctx.from.id, {
                action: 'deliver_order',
                orderId: orderId,
                userId: order.user_id,
                productName: product.name,
                quantity: order.quantity,
            });

            await ctx.editMessageText(
                ctx.callbackQuery.message.text + '\n\n💳 ĐÃ XÁC NHẬN THANH TOÁN',
                { parse_mode: 'HTML' }
            );

            await ctx.replyWithHTML(
                `📝 <b>GIAO HÀNG THỦ CÔNG — Đơn #${orderId}</b>\n\n` +
                `📦 SP: <b>${product.name}</b>\n` +
                `📊 SL: ${order.quantity}\n\n` +
                `👇 Gửi thông tin tài khoản ngay bây giờ:\n\n` +
                `<i>Ví dụ:</i>\n` +
                `<code>email@outlook.com|passmail|passchatgpt</code>\n\n` +
                `Bot sẽ tự động chuyển cho khách.\n` +
                `Gõ /cancel để hủy.`
            );
        }
    });

    bot.action(/^admin_cancel_(\d+)$/, (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return ctx.answerCbQuery('⛔');

        const orderId = parseInt(ctx.match[1]);
        orderService.cancel(orderId);
        ctx.answerCbQuery('❌ Đã hủy');
        ctx.editMessageText(
            ctx.callbackQuery.message.text + '\n\n❌ ĐÃ HỦY ĐƠN HÀNG',
            { parse_mode: 'HTML' }
        );

        const order = orderService.getById(orderId);
        if (order) {
            bot.telegram.sendMessage(order.user_id, '❌ Đơn hàng của bạn đã bị hủy. Liên hệ hỗ trợ nếu cần.').catch(() => { });
        }
    });

    // Xử lý hủy đơn (phía người dùng)
    bot.action('cancel_order', (ctx) => {
        ctx.answerCbQuery('❌ Đã hủy');
        ctx.editMessageText('❌ Đơn hàng đã bị hủy.');
    });

    bot.action(/^cancel_order_(\d+)$/, (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        orderService.cancel(orderId);
        ctx.answerCbQuery('❌ Đã hủy đơn hàng');
        ctx.reply('❌ Đơn hàng đã bị hủy.');
    });
};
