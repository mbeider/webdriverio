import { launch as launchChromeBrowser } from 'chrome-launcher'
import puppeteer from 'puppeteer-core'
import { devicesMap } from 'puppeteer-core/DeviceDescriptors'
import logger from '@wdio/logger'

import browserFinder from './finder'
import { getPages } from './utils'
import {
    CHROME_NAMES, FIREFOX_NAMES, EDGE_NAMES, DEFAULT_FLAGS, DEFAULT_WIDTH,
    DEFAULT_HEIGHT, DEFAULT_X_POSITION, DEFAULT_Y_POSITION, VENDOR_PREFIX
} from './constants'

const log = logger('devtools')

const DEVICE_NAMES = Object.values(devicesMap).map((device) => device.name)

/**
 * launches Chrome and returns a Puppeteer browser instance
 * @param  {object} capabilities  session capabilities
 * @return {object}               puppeteer browser instance
 */
async function launchChrome (capabilities) {
    const chromeOptions = capabilities[VENDOR_PREFIX.chrome] || {}
    const mobileEmulation = chromeOptions.mobileEmulation || {}
    const ignoreDefaultArgs = capabilities.ignoreDefaultArgs

    if (typeof mobileEmulation.deviceName === 'string') {
        const deviceProperties = Object.values(devicesMap).find(device => device.name === mobileEmulation.deviceName)

        if (!deviceProperties) {
            throw new Error(`Unknown device name "${mobileEmulation.deviceName}", available: ${DEVICE_NAMES.join(', ')}`)
        }

        mobileEmulation.userAgent = deviceProperties.userAgent
        mobileEmulation.deviceMetrics = {
            width: deviceProperties.viewport.width,
            height: deviceProperties.viewport.height,
            pixelRatio: deviceProperties.viewport.deviceScaleFactor
        }
    }

    const defaultFlags = Array.isArray(ignoreDefaultArgs) ? DEFAULT_FLAGS.filter(flag => !ignoreDefaultArgs.includes(flag)) : (!ignoreDefaultArgs) ? DEFAULT_FLAGS : []
    const deviceMetrics = mobileEmulation.deviceMetrics || {}
    const chromeFlags = [
        ...defaultFlags,
        ...[
            `--window-position=${DEFAULT_X_POSITION},${DEFAULT_Y_POSITION}`,
            `--window-size=${DEFAULT_WIDTH},${DEFAULT_HEIGHT}`
        ],
        ...(chromeOptions.headless ? [
            '--headless',
            '--no-sandbox'
        ] : []),
        ...(chromeOptions.args || [])
    ]

    if (typeof deviceMetrics.pixelRatio === 'number') {
        chromeFlags.push(`--device-scale-factor=${deviceMetrics.pixelRatio}`)
    }

    if (typeof mobileEmulation.userAgent === 'string') {
        chromeFlags.push(`--user-agent=${mobileEmulation.userAgent}`)
    }

    log.info(`Launch Google Chrome with flags: ${chromeFlags.join(' ')}`)

    const chrome = await launchChromeBrowser({
        chromePath: chromeOptions.binary,
        ignoreDefaultArgs,
        chromeFlags
    })

    log.info(`Connect Puppeteer with browser on port ${chrome.port}`)
    const browser = await puppeteer.connect({
        ...chromeOptions,
        browserURL: `http://localhost:${chrome.port}`,
        defaultViewport: null
    })

    /**
     * when using Chrome Launcher we have to close a tab as Puppeteer
     * creates automatically a new one
     */
    const pages = await getPages(browser)
    for (const page of pages.slice(0, -1)) {
        if (page.url() === 'about:blank') {
            await page.close()
        }
    }

    if (deviceMetrics.width && deviceMetrics.height) {
        await pages[0].setViewport(deviceMetrics)
    }

    return browser
}

function launchBrowser (capabilities, product) {
    const vendorCapKey = VENDOR_PREFIX[product]
    const ignoreDefaultArgs = capabilities.ignoreDefaultArgs

    if (!capabilities[vendorCapKey]) {
        capabilities[vendorCapKey] = {}
    }

    const executablePath = (
        capabilities[vendorCapKey].binary ||
        browserFinder[product][process.platform]()[0]
    )

    const puppeteerOptions = Object.assign({
        product,
        executablePath,
        ignoreDefaultArgs,
        defaultViewport: {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT
        }
    }, capabilities[vendorCapKey] || {})

    if (!executablePath) {
        throw new Error('Couldn\'t find executable for browser')
    }

    log.info(`Launch ${executablePath} with config: ${JSON.stringify(puppeteerOptions)}`)
    return puppeteer.launch(puppeteerOptions)
}

export default function launch (capabilities) {
    const browserName = capabilities.browserName.toLowerCase()

    if (CHROME_NAMES.includes(browserName)) {
        return launchChrome(capabilities)
    }

    if (FIREFOX_NAMES.includes(browserName)) {
        return launchBrowser(capabilities, 'firefox')
    }

    /* istanbul ignore next */
    if (EDGE_NAMES.includes(browserName)) {
        return launchBrowser(capabilities, 'edge')
    }

    throw new Error(`Couldn't identify browserName ${browserName}`)
}
