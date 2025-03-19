import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const url = "https://auctions.leonardjoel.com.au/custom_asp/searchresults.asp?st=D&ps=150&pg=1&sale_no=LJ8773#40868504";

const browser = await puppeteer.launch({
    headless: true,
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

const fetchAuctionLinksFromPage = async (page) => {
    // Wait for the main selector containing the auction items
    await page.waitForSelector('section.auction-collection-item');

    // Get item URLs from the current page
    return await page.evaluate(() => {
        const items = Array.from(
            document.querySelectorAll('section.auction-collection-item')
        );

        return items
            .map(item => {
                const listing = item.querySelector(
                    'a:nth-child(2)'
                )?.href;

                return listing
            })
    });
};

const processAuctionLinks = async (links) => {
    const provInfos = [];
    
    for (const link of links) {
        console.log(`Processing URL: ${link.url}`);
        await page.goto(link.url, { timeout: 0 });
        
        await page.waitForSelector('.p1'); // Wait for the page to load

        // Extract the content and push it to the array
        const info = await page.evaluate(() => {

            const allText = document.querySelector('.flexible-text-container > div > div:nth-child(2) > section').innerHTML.split('<br>').map(text => {
                return new DOMParser().parseFromString(text, 'text/html').body.textContent.trim()
            });

            const lotStringLength = document.querySelector('.p1').innerHTML.trim().split(" ").length
            const lotNum = document.querySelector('.p1').innerHTML.trim().split(" ")[lotStringLength - 1]

            const estimateText = document.querySelector('.flexible-text-container > div > div:nth-child(2) > section:nth-child(2) > p').innerHTML.substring(8).trim().split('-').map(price => price.trim())
            const estimateTextLow = estimateText[0]
            const estimateTextHigh = estimateText[1]
            
            
            // const priceText = document.querySelector('.flexible-text-container > div > div:nth-child(2) > section:nth-child(3)').innerHTML.trim().substring(11).split('<')[0].trim()
            
            // const provElement = document.querySelector('div.accordion:has(input#section1) > .accordion-content');
            // const provenance = provElement ? new DOMParser().parseFromString(provElement.innerHTML, 'text/html') : null;
            // const provText = provenance ? provenance.body.textContent.trim() : null;

            // const exhibElement = document.querySelector('div.accordion:has(input#section4) > .accordion-content');
            // const exhibition = exhibElement ? new DOMParser().parseFromString(exhibElement.innerHTML, 'text/html') : null;
            // const exhibText = exhibition ? exhibition.body.textContent.trim() : null;



            const infoObject = {
                lot: lotNum,
                title: allText[1],
                artist: allText[0],
                medium: allText[2],
                signage: allText.filter((signageItem, index) => {
                    if((index > 2) && (index < (allText.length - 2))) {
                        return signageItem
                    }
                }).join(","),
                size: allText[allText.length - 2],
                // size: allText[allText.length - 3],
                // provenance: provText,
                // exhibition_history: exhibText,
                estimateLow: estimateTextLow,
                estimateHigh: estimateTextHigh,
                // price: priceText,
            }
            return infoObject
        });

        provInfos.push(info); // Push the extracted content into the array
    }
    return provInfos; // Return the array after processing all links
};


const init = async () => {
    const allAuctionLinks = []; // Collect all item links in this array
    const allItemInfo = [];
    let auctionDate = '';

    
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

        await page.waitForSelector('.row.flex-end.child-row')
        const getAuctionDate = await page.evaluate(() => {
            const auctiondate = document.querySelector('.row.flex-end.child-row > section > p:has(br)').innerHTML.split('<br>')[1].trim().split(',')[0]

            return auctiondate
        });
        auctionDate = getAuctionDate

        // Fetch items from each page in the auction
        for (const [pageIndex, pageUrl] of res.entries()) {
            console.log(
                `Fetching links from page ${pageIndex + 1}: ${pageUrl}`
            );
            await page.goto(pageUrl,{timeout: 0});

            const auction_items = await fetchAuctionLinksFromPage(page);

            // Append item links to the list with additional metadata
            allAuctionLinks.push(
                ...auction_items.map((item, index) => ({
                    url: item,
                    page: pageIndex + 1,
                    order: index + 1,
                }))
            );
        }

    // Save all item links to a JSON file
    let jsonFilePath = './auction-items-links.json';
    fs.writeFileSync(jsonFilePath, JSON.stringify(allAuctionLinks, null, 2));
    console.log('All links saved to auction-items-links.json');

    // Go into each URL link from the JSON file
    const savedLinks = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
    const itemInfos = await processAuctionLinks(savedLinks);

    allItemInfo.push(
        ...itemInfos.map((item, index) => ({
            lot: item.lot,
            title: item.title,
            artist: item.artist,
            medium: item.medium,
            signage: item.signage,
            size: item.size,
            // provenance: item.provenance,
            // exhibition_history: item.exhibition_history,
            // auction_date: auctionDate,
            low_estimated_value: item.estimateLow,
            high_estimated_value: item.estimateHigh,
            // auction_price: item.price,
            // auction_house: 'Leonard Joel',
            order: index + 1,
        }))
    );

    jsonFilePath = './auction-items-info.json';
    fs.writeFileSync(jsonFilePath, JSON.stringify(allItemInfo, null, 2));
    console.log('All info saved to auction-items-info.json');

    // Convert the JSON to CSV
    const csvFilePath = path.resolve('./auction-items-info.csv');
    convertJsonToCsv(jsonFilePath, csvFilePath);
    
    await browser.close();
};

emptyLinksFile();
init();
