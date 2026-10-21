// The page's stylesheet and markup travel inside the compressed bundle (build.mjs): left as text in the HTML file,
// they cost about 28 KB more. They are put in place before any other module of the app runs, because those look
// up their elements as they load (main.js imports this first). The markup is src/index.html's own, taken at build
// time: it never holds anything a user typed.
const style = document.createElement('style');
style.textContent = __CSS__;
document.head.append(style);
document.body.insertAdjacentHTML('afterbegin', __BODY__);
