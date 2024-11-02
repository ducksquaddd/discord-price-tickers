const Discord = require("discord.js");
const https = require("https");
require("dotenv").config();

/**
 * Creates a new Discord client with required intents
 * @returns {Discord.Client} Configured Discord client instance
 */
const createClient = () =>
  new Discord.Client({
    intents: [
      Discord.GatewayIntentBits.Guilds,
      Discord.GatewayIntentBits.GuildMembers,
    ],
  });

// Initialize separate client instances for each cryptocurrency
const AtomClient = createClient();
const BitcoinClient = createClient();
const EthClient = createClient();

/**
 * Fetches cryptocurrency data from CoinGecko API
 * @param {string} coinId - The ID of the cryptocurrency to fetch
 * @returns {Promise<Object>} Parsed JSON response from CoinGecko
 */
const fetchCoinData = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.coingecko.com",
      path: `/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,cosmos&sparkline=false`,
      headers: {
        "x-cg-demo-api-key": process.env.CG_API,
      },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(JSON.parse(data));
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};

/**
 * Fetches and formats price data for all tracked cryptocurrencies
 * @returns {Promise<Object|null>} Formatted price data or null if error occurs
 */
const getData = async () => {
  try {
    const coins = await fetchCoinData();

    // Format the response data
    const result = {
      atom: {
        price: coins.find((c) => c.id === "cosmos").current_price,
        "24h": coins.find((c) => c.id === "cosmos").price_change_percentage_24h,
      },
      btc: {
        price: coins.find((c) => c.id === "bitcoin").current_price,
        "24h": coins.find((c) => c.id === "bitcoin")
          .price_change_percentage_24h,
      },
      eth: {
        price: coins.find((c) => c.id === "ethereum").current_price,
        "24h": coins.find((c) => c.id === "ethereum")
          .price_change_percentage_24h,
      },
    };

    console.log(result);
    return result;
  } catch (e) {
    console.error("Error fetching data:", e);
    return null;
  }
};

/**
 * Checks if any cryptocurrency price is down in the last 24h
 * @param {Object} data - Price data for all cryptocurrencies
 * @returns {boolean} True if any price is down
 */
const arePricesDown = (data) =>
  data.atom["24h"] < 0 || data.btc["24h"] < 0 || data.eth["24h"] < 0;

/**
 * Updates a Discord bot's status, activity, and nickname based on price data
 * @param {Discord.Client} client - Discord client to update
 * @param {string} guildId - Discord server ID
 * @param {string} name - Cryptocurrency name
 * @param {number} price - Current price
 * @param {number} change - 24h price change percentage
 * @param {string} status - Bot status to set
 */
const updateClient = async (client, guildId, name, price, change, status) => {
  try {
    if (!client.user) {
      console.log(`${name} client is not ready yet. Skipping update.`);
      return;
    }

    // Update bot status and activity
    client.user.setStatus(status);
    client.user.setActivity(`24h | ${change.toFixed(2)}%`, {
      type: Discord.ActivityType.Playing,
    });

    // Update bot nickname in the guild
    const guild = await client.guilds.fetch(guildId);
    if (guild) {
      const member = await guild.members.fetch(client.user.id);
      const newNickname = `${name} $${formatNumber(price)}`;

      if (member.nickname !== newNickname) {
        try {
          await member.setNickname(newNickname);
          console.log(
            `Successfully updated ${name} nickname to: ${newNickname}`
          );
        } catch (nickError) {
          console.error(`Error setting nickname for ${name}:`, nickError);

          if (nickError.code === 50013) {
            console.error(
              `Bot doesn't have permission to change its nickname in ${guild.name}`
            );
          }
        }
      } else {
        console.log(`${name} nickname is already up to date: ${newNickname}`);
      }
    } else {
      console.error(`Guild with ID ${guildId} not found for ${name} client`);
    }
  } catch (e) {
    console.error(`Error updating ${name} client:`, e);
  }
};

/**
 * Updates all cryptocurrency bots with current price data
 */
const update = async () => {
  try {
    const data = await getData();
    if (!data) return;

    const guildId = "1049783263956324462";
    const status = arePricesDown(data) ? "dnd" : "online";

    // Update all clients concurrently
    await Promise.all([
      updateClient(
        AtomClient,
        guildId,
        "Atom",
        data.atom.price,
        data.atom["24h"],
        status
      ),
      updateClient(
        BitcoinClient,
        guildId,
        "Bitcoin",
        data.btc.price,
        data.btc["24h"],
        status
      ),
      updateClient(
        EthClient,
        guildId,
        "Ethereum",
        data.eth.price,
        data.eth["24h"],
        status
      ),
    ]);
  } catch (e) {
    console.error("Error updating:", e);
  }
};

/**
 * Sets up event handlers for a Discord client
 * @param {Discord.Client} client - Discord client to setup
 * @param {string} name - Name of the cryptocurrency
 */
const setupClient = (client, name) => {
  client.on("ready", () => {
    console.log(`${client.user.tag} (${name}) is online`);
    client.isReady = true;
  });
};

// Setup event handlers for all clients
setupClient(AtomClient, "Atom");
setupClient(BitcoinClient, "Bitcoin");
setupClient(EthClient, "Ethereum");

/**
 * Checks if all Discord clients are ready
 * @returns {boolean} True if all clients are ready
 */
const allClientsReady = () =>
  AtomClient.isReady && BitcoinClient.isReady && EthClient.isReady;

/**
 * Waits for all clients to be ready before starting updates
 */
const waitForClients = () => {
  if (allClientsReady()) {
    console.log("All tickers online");
    update();
    setInterval(update, 5 * 6000); // Update every 5 minutes
  } else {
    setTimeout(waitForClients, 1000);
  }
};

// Login all clients and start the application
Promise.all([
  AtomClient.login(process.env.ATOM_CLIENT),
  BitcoinClient.login(process.env.BITCOIN_CLIENT),
  EthClient.login(process.env.ETH_CLIENT),
])
  .then(() => {
    console.log("All clients logged in");
    waitForClients();
  })
  .catch((error) => {
    console.error("Error logging in:", error);
  });

/**
 * Formats a number to a readable string with k suffix for thousands
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
const formatNumber = (num) =>
  num >= 1000 ? (num / 1000).toFixed(2) + "k" : num.toFixed(2);
