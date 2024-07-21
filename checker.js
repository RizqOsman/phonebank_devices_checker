const puppeteer = require('puppeteer');
const fs = require('fs');

async function bukaSitus() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const urlArr = [
    // //STIN
    'http://192.168.98.13:5555/', 
    'http://192.168.98.14:5555/',
    'http://192.168.98.15:5555/',
    'http://192.168.98.16:5555/',
    'http://192.168.98.17:5555/', 
    'http://192.168.98.18:5555/',

    'http://192.168.98.43:5555/', 
    'http://192.168.98.44:5555/',
    'http://192.168.98.45:5555/',
    'http://192.168.98.46:5555/',
    'http://192.168.98.47:5555/', 
    'http://192.168.98.48:5555/',

    // //Manggala
    'http://192.168.98.3:5555/', 
    'http://192.168.98.4:5555/',
    'http://192.168.98.5:5555/',
    'http://192.168.98.6:5555/',
    'http://192.168.98.7:5555/', 
    'http://192.168.98.8:5555/',


    // //Cipondoh
    'http://192.168.98.33:5555/', 
    'http://192.168.98.34:5555/',
    'http://192.168.98.35:5555/',
    'http://192.168.98.36:5555/',
    'http://192.168.98.37:5555/', 
    'http://192.168.98.38:5555/',

    // //Depok
    'http://192.168.98.23:5555/', 
    'http://192.168.98.24:5555/',
    'http://192.168.98.25:5555/',
    'http://192.168.98.26:5555/',
    'http://192.168.98.27:5555/', 
    'http://192.168.98.28:5555/',

    // //Posko 0
    'http://192.168.98.53:5555/', 
    'http://192.168.98.54:5555/',
    'http://192.168.98.55:5555/',
    'http://192.168.98.56:5555/',

    // //DEIMOS
    'http://15.15.15.19:5555/', 
    'http://15.15.15.26:5555/',
    'http://15.15.15.33:5555/',
    'http://15.15.15.34:5555/',
    'http://15.15.15.40:5555/', 
    'http://15.15.15.145:5555/',
    'http://15.15.15.146:5555/',
  ];
  const dataArr = [];

  try {
    for (const url of urlArr) {
      try {
        const page = await browser.newPage();

        await page.goto(url);
        console.log(`Connecting: ${url}`);

        await page.waitForTimeout(5000);

        const authorized = await page.$eval('#auth', (element) => element.textContent);
        console.log('Teks Identity (Authorized):', authorized);

        const unauthorized = await page.$eval('#unauth', (element) => element.textContent);
        console.log('Teks Identity (Unauthorized):', unauthorized);

        const ipValue = await page.$eval('#ip', (element) => element.value);
        console.log('Nilai IP:', ipValue);

        const data = {
          auth: authorized,
          unauth: unauthorized,
          ipPB: ipValue,
          ip: url.replace('http://', '').split(':')[0],
        };

        dataArr.push(data);
        await page.close();
      } catch (error) {
        console.error(`Terjadi kesalahan saat Connecting ${url}: ${error.message}`);
      }
    }

    const jsonData = JSON.stringify(dataArr, null, 2);
    fs.writeFileSync('data.json', jsonData);

    console.log('Data disimpan ke data.json');
  } catch (error) {
    console.error('Terjadi kesalahan:', error.message);
  } finally {
    await browser.close();
  }
}

bukaSitus();