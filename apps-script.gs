/**
 * Приём заявок на новогодний адвент-календарь в Google Таблицу + счётчик оставшихся календарей.
 *
 * Установка:
 * 1. Создайте Google Таблицу → Расширения → Apps Script.
 * 2. Вставьте этот код вместо содержимого Code.gs, сохраните.
 * 3. При желании укажите e-mail в NOTIFY_EMAIL — на него будет приходить письмо о каждой заявке.
 * 4. Развернуть → Новое развертывание → тип «Веб-приложение»:
 *      Выполнять как: «Я»; У кого есть доступ: «Все».
 *    Подтвердите доступы (Google предупредит о «непроверенном приложении» — это ваш скрипт,
 *    нажмите «Дополнительно» → «Перейти»).
 * 5. Скопируйте URL веб-приложения (оканчивается на /exec) и вставьте его в index.html
 *    в строку  const ORDER_ENDPOINT = '';
 *
 * Счётчик «Осталось N из 12» считает все заявки, кроме строк со статусом «Отменена» или «Лист ожидания».
 * Если заявка не подтвердилась — поменяйте ей статус на «Отменена», и календарь снова станет доступен.
 *
 * После любых правок кода: Развернуть → Управление развертываниями → ✎ → Версия «Новая» → Развернуть
 * (URL при этом не меняется).
 */

const SHEET_NAME = 'Заявки';
const NOTIFY_EMAIL = ''; // например 'you@gmail.com'; пусто — без писем

const TOTAL = 12;
const PREORDER_PRICE = 17900;
const PREORDER_UNTIL = new Date('2026-11-15T23:59:59+03:00');
const REGULAR_PRICE = 19900;
const PREPAY = 0.3;
const NOT_COUNTED = ['Отменена', 'Лист ожидания'];

const COLUMNS = [
  ['date', 'Дата заявки'],
  ['name', 'Имя'],
  ['phone', 'Телефон'],
  ['contact', 'Telegram / мессенджер'],
  ['qty', 'Количество'],
  ['price', 'Цена за шт, ₽'],
  ['sum', 'Сумма, ₽'],
  ['prepay', 'Предоплата 30%, ₽'],
  ['delivery', 'Способ получения'],
  ['address', 'Адрес СДЭК'],
  ['comment', 'Комментарий'],
  ['status', 'Статус'],
  ['page', 'Страница'],
];

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.website) return json_({ ok: true }); // антиспам-ловушка

  const qty = Math.min(Math.max(parseInt(p.qty, 10) || 1, 1), TOTAL);
  const now = new Date();
  const pre = now <= PREORDER_UNTIL;
  const price = pre ? PREORDER_PRICE : REGULAR_PRICE;
  let values;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const left = TOTAL - countReserved_(sheet);
    values = Object.assign({}, p, {
      date: now,
      qty: qty,
      price: price,
      sum: price * qty,
      prepay: pre ? Math.round(price * qty * PREPAY) : '',
      status: qty <= left ? 'Новая' : 'Лист ожидания',
    });
    sheet.appendRow(COLUMNS.map(([key]) => clean_(values[key])));
  } finally {
    lock.releaseLock();
  }

  if (NOTIFY_EMAIL) {
    const body = COLUMNS
      .filter(([key]) => values[key] !== '' && values[key] != null && key !== 'page')
      .map(([key, title]) => `${title}: ${values[key]}`)
      .join('\n');
    MailApp.sendEmail(NOTIFY_EMAIL, `Новая заявка на адвент: ${p.name || ''} (${values.status})`, body);
  }
  return json_({ ok: true });
}

// GET ?action=stock → {"total":12,"left":7}
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'stock') {
    const left = Math.max(0, TOTAL - countReserved_(getSheet_()));
    return json_({ total: TOTAL, left: left });
  }
  return ContentService.createTextOutput('Приём заявок работает');
}

function countReserved_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return 0;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const qtyCol = header.indexOf('Количество');
  const statusCol = header.indexOf('Статус');
  return sheet.getRange(2, 1, rows, header.length).getValues()
    .filter(r => NOT_COUNTED.indexOf(String(r[statusCol]).trim()) === -1)
    .reduce((sum, r) => sum + (parseInt(r[qtyCol], 10) || 0), 0);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(([, title]) => title));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    const statusCol = COLUMNS.findIndex(([key]) => key === 'status') + 1;
    sheet.getRange(2, statusCol, 1000, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Новая', 'Подтверждена', 'Предоплата получена', 'Оплачена', 'Отправлена', 'Лист ожидания', 'Отменена'])
        .build());
  }
  return sheet;
}

// Защита от формул в ячейках (=, +, -, @ в начале строки) и ограничение длины
function clean_(v) {
  if (v instanceof Date || typeof v === 'number') return v;
  const s = String(v == null ? '' : v).slice(0, 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
