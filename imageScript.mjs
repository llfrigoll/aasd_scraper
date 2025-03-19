import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const url = 'https://auctions.leonardjoel.com.au/custom_asp/searchresults.asp?type=result&st=D&pg=1&ps=100&sale_no=LJ8762+';

const browser = await puppeteer.launch({
    headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1024 });

const emptyLinksFile = () => {
    const filePath = './image-links.json';
    if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]'); // Reset the file to an empty array
    }
};

const fetchImagesFromPage = async (page) => {
    // Wait for the main selector containing the auction items
    await page.waitForSelector('section.flexible-auction-item');

    // Get image URLs from the current page
    return await page.evaluate(() => {
        const items = Array.from(
            document.querySelectorAll('section.flexible-auction-item')
        );

        return items
            .map(item => {
                const bgImage = item.querySelector(
                    '.flexible-auction-item__image'
                )?.style.backgroundImage;

                return bgImage
                    ? bgImage.replace(/url\(\"/, '').replace(/\"\)/, '')
                    : null;
            })
            .filter(image => image !== null); // Remove null results
    });
};

const convertJsonToCsv = (jsonFilePath, csvFilePath) => {
    try {
        // Read and parse the JSON file
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));

        // Format each row as =IMAGE(url, 1)
        const csvData = jsonData
            .map(item => `=IMAGE("${item.url}", 1)`)
            .join('\n');

        // Write the CSV data to the file
        fs.writeFileSync(csvFilePath, csvData);
        console.log(`CSV file created at: ${csvFilePath}`);
    } catch (error) {
        console.error('Error converting JSON to CSV:', error.message);
    }
};

const init = async () => {
    let allImageLinks = []; // Collect all image links in this array
    
        await page.goto(url);

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

        // Fetch images from each page in the auction
        for (const [pageIndex, pageUrl] of res.entries()) {
            console.log(
                `Fetching images from page ${pageIndex + 1}: ${pageUrl}`
            );
            await page.goto(pageUrl);

            const images = await fetchImagesFromPage(page);

            // Append image links to the list with additional metadata
            allImageLinks.push(
                ...images.map((image, index) => ({
                    url: image,
                    page: pageIndex + 1,
                    order: index + 1,
                }))
            );
        }

    // Save all image links to a JSON file
    const jsonFilePath = './image-links.json';
    fs.writeFileSync(jsonFilePath, JSON.stringify(allImageLinks, null, 2));
    console.log('All image links saved to image-links.json');

    // Convert the JSON to CSV
    const csvFilePath = path.resolve('./images.csv');
    convertJsonToCsv(jsonFilePath, csvFilePath);

    await browser.close();
};

emptyLinksFile();
init();
