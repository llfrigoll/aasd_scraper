import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const url = "https://www.aasd.com.au/catalogue/250318gim-autumn-art-online/";

const browser = await puppeteer.launch({
    headless: false,
});

const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1024 });

const convertJsonToCsv = (jsonFilePath, csvFilePath) => {
    try {
      // Read and parse the JSON file
      const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
  
      // Ensure it's an array
      if (!Array.isArray(jsonData)) {
        throw new Error('JSON data must be an array of objects.');
      }
  
      // Get the CSV headers (keys of the first object)
      const headers = Object.keys(jsonData[0]);
  
      // Create the CSV rows
      const csvRows = jsonData.map(item =>
        headers.map(header => (item[header] !== null && item[header] !== undefined ? `"${item[header]}"` : '')).join(',')
      );
  
      // Combine the headers and rows
      const csvData = [headers.join(','), ...csvRows].join('\n');
  
      // Write the CSV data to the specified file
      fs.writeFileSync(csvFilePath, csvData, 'utf-8');
      console.log(`CSV file created at: ${csvFilePath}`);
    } catch (error) {
      console.error('Error converting JSON to CSV:', error.message);
    }
  };

const emptyLinksFile = () => {
    const filePath = './auction-items-links.json';
    if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]'); // Reset the file to an empty array
    }
};

const processAuctionItems = async () => {
   
    
    await page.waitForSelector('table')

    const info = await page.evaluate(() => {
        const provInfos = [];
        const allInfo = [...document.querySelectorAll('tr')].slice(1)

        for (const item of allInfo) {
            const lotNum = Number(item.querySelector('td').innerHTML)

            const artistTemp = item.querySelector('td:nth-child(3) > a').innerText.split(',')
            const artist = (artistTemp[1].trim() + ' ' + artistTemp[0].trim()).trim()

            const artwork_name = item.querySelector('td:nth-child(3) > h3').innerText

            const arbText = item.querySelector('td:nth-child(3)').innerText.split('\n')[2].split(',')
            const size = arbText[arbText.length - 1]

            let medium = ""
            let signage = ""
            let bFound = false
            let i = 0
            let indexOfOn = -1
            while (bFound === false && i < arbText.length) {

                if(arbText[i].includes(' on ')) {
                    bFound = true
                    indexOfOn = i
                }
                i++
            }
            
            if(bFound === false) {
                medium = arbText[0]
                if(arbText.length > 2) {
                    for(let i = 1; i < arbText.length - 1; i++){
                        signage = signage + ' ' + arbText[i]
                    }
                } 
            }else if(bFound === true && indexOfOn === 0) {
                medium = arbText[0]
                if(arbText.length > 2) {
                    for(let i = 1; i < arbText.length - 1; i++){
                        signage = signage + ' ' + arbText[i]
                    }
                }
            }else if(bFound === true && indexOfOn > 0 && !arbText[indexOfOn - 1].includes('/')) {
                for(let i = 0; i <= indexOfOn; i++) {
                    medium = medium + ' ' + arbText[i]
                }
                if(arbText.length > 2) {
                    for(let u = indexOfOn + 1; u < arbText.length - 1; u++){
                        signage = signage + ' ' + arbText[u]
                    }
                }
            }else if(bFound === true && indexOfOn > 0 && arbText[indexOfOn - 1].includes('/')) {
                for(let i = 0; i < indexOfOn - 1; i++) {
                    medium = medium + ' ' + arbText[i]
                }
                if(arbText.length > 2) {
                    for(let u = indexOfOn - 1; u < arbText.length - 1; u++){
                        signage = signage + ' ' + arbText[u]
                    }
                }
            }

            const price = item.querySelector('td:nth-child(4)').innerText

            const infoObject = {
                lot: lotNum,
                title: artwork_name,
                artist: artist,
                medium: medium.trim(),
                signage: signage.trim(),
                size: size.trim(),
                price: price,
            }
            provInfos.push(infoObject)
        }
        return provInfos
    })
    return info
};


const init = async () => {
    const allAuctionLinks = []; // Collect all item links in this array
    const allItemInfo = [];
    
        await page.goto(url,{timeout: 0});

        // Get pagination URLs
        await page.waitForSelector('.pagination');
        const res = await page.evaluate(() => {
            const pagination = document.querySelector('.pagination');
            const ul = pagination?.children[0];
            const li = ul?.children[1];

            if (!li) return []; // Return an empty array if li doesn't exist

            // Extract href values from all <a> tags inside li
            return Array.from(li.querySelectorAll('a')).map(a => a.href);
        });

        // If there's only one page, `res` will be empty, so include the original URL
        res.pop();
        if (res.length === 0) {
            res.push(url);
        }

        // Fetch items from each page in the auction
        for (const [pageIndex, pageUrl] of res.entries()) {
            console.log(
                `Fetching links from page ${pageIndex + 1}: ${pageUrl}`
            );
            await page.goto(pageUrl,{timeout: 0});

            const auction_items = await processAuctionItems();

            // Append item links to the list with additional metadata
            allAuctionLinks.push(
                ...auction_items.map(item => ({
                    item
                }))
            );
        }

    // jsonFilePath = './auction-items-info.json';
    // fs.writeFileSync(jsonFilePath, JSON.stringify(allAuctionLinks, null, 2));
    // console.log('All info saved to auction-items-info.json');

    // // Convert the JSON to CSV
    // const csvFilePath = path.resolve('./auction-items-info.csv');
    // convertJsonToCsv(jsonFilePath, csvFilePath);
    console.log(allAuctionLinks)
    
    await browser.close();
};

emptyLinksFile();
init();
