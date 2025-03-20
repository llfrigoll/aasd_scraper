import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const jsonAllLinks = JSON.parse(fs.readFileSync('./all-links.json', 'utf-8'));
const urls = [...jsonAllLinks].filter(data => checkString(data.link));

const browser = await puppeteer.launch({
    headless: false,
});

const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1024 });

function checkString(str) {
    // Regular expression: looks for a digit (\d) followed by either "las" or "lam", followed by "-"
    const pattern = /\d(mkp)-/;
    return pattern.test(str);
}

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

            let artistTemp = ""
            let artistFirstName = ""
            let artist = ""
            if(item.querySelector('td:nth-child(3) > a').innerText.includes(',')) {
                artistTemp = item.querySelector('td:nth-child(3) > a').innerText.split(',')
                for(let i = 1; i < artistTemp.length; i++) {
                    artistFirstName = artistFirstName + ' ' + artistTemp[i].trim()
                }

                artist = (artistFirstName.trim() + ' ' + artistTemp[0].trim()).trim()
            }else {
                artist = item.querySelector('td:nth-child(3) > a').innerText
            }
            
            

            const artwork_name = item.querySelector('td:nth-child(3) > h3').innerText

            let medium = ""
            let signage = ""
            let size = ""
            if(item.querySelector('td:nth-child(3)').innerText.split('\n').length > 2) {
                const arbText = item.querySelector('td:nth-child(3)').innerText.split('\n')[2].split(',')
                size = arbText[arbText.length - 1]

                
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
            }

            const infoObject = {
                lot: lotNum,
                title: artwork_name,
                artist: artist,
                medium: medium.trim(),
                signage: signage.trim(),
                size: size.trim(),
            }
            provInfos.push(infoObject)
        }
        return provInfos
    })
    return info
};


const init = async () => {
    const allAuctionLinks = []; 
    
    for(const url of urls) {
        await page.goto(url.link,{timeout: 0});

        await page.waitForSelector('table');
        const res = await page.evaluate((link) => {
            const pagination = document.querySelector('.pagination');
            if (!pagination) return [];
            const numOfPages = Number(document.querySelector('.pagination').getAttribute('data-pages-total'))

            const arrPages = [];
            for(let i = 1; i <= numOfPages; i++) {
                if(i === 1) {
                    arrPages.push(link)
                }else {
                    arrPages.push(link + `?page=${i}`)
                } 
            }
            return arrPages
        }, url.link); 

        // If there's only one page, `res` will be empty, so include the original URL
        if (res.length === 0) {
            res.push(url.link);
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
                    "lot": item.lot,
                    "title": item.title,
                    "artist": item.artist,
                    "medium": item.medium,
                    "signage": item.signage,
                    "size": item.size,
                    "sale_date": url.date,
                    "auction_house": "McKenzies Auctioneers",
                    "auction_name": url.auction_name
                }))
            );
        }
    }
        

    const jsonFilePath = './auction-items-info.json';
    fs.writeFileSync(jsonFilePath, JSON.stringify(allAuctionLinks, null, 2));
    console.log('All info saved to auction-items-info.json');

    // Convert the JSON to CSV
    const csvFilePath = path.resolve('./auction-items-info.csv');
    convertJsonToCsv(jsonFilePath, csvFilePath);
    
    await browser.close();
};

emptyLinksFile();
init();
