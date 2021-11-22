import fetch from "node-fetch";
import dotenv from "dotenv";
import Moralis from "moralis/node.js";
import InputDataDecoder from "ethereum-input-data-decoder";
import Web3 from "web3";

dotenv.config();
const { SERVER_URL, APP_ID, JOE_ROUTER_ADDRESS, SNOWDOG_TOKEN_ADDRESS, SNOWDOG_DECIMALS, SNOWDOG_MIM_LP_ADDRESS } = process.env;
const NON_HEX_SNOWDOG_TOKEN_ADDRESS = SNOWDOG_TOKEN_ADDRESS.toLowerCase().substring(2);

const web3 = new Web3();
const decoder = new InputDataDecoder(`JoeRouter02Abi.json`);
const swapTypes = [
    {type: 'uint256', name: 'amount0In'}, 
    {type: 'uint256', name: 'amount1In'}, 
    {type: 'uint256', name: 'amount0Out'}, 
    {type: 'uint256', name: 'amount1Out'}, 
];
const syncTypes = [
    {type: 'uint256', name: 'reserve0'}, 
    {type: 'uint256', name: 'reserve1'}, 
];

(async function(){
    await Moralis.start({serverUrl: SERVER_URL, appId: APP_ID});

    let block = await Moralis.Web3API.native.getDateToBlock({
        chain: "avalanche",
        data: new Date()
    });

    let currentBlockId = 7298160;

    setInterval(async () => {
        const block = await Moralis.Web3API.native.getBlock({
            chain: "avalanche",
            block_number_or_hash: currentBlockId.toString()
        });

        if(block.hash){
            currentBlockId++;
            logTraderJoeTransactions(block);
        }
    }, 700);
})().catch(console.log);

async function logTraderJoeTransactions(block){
    console.time('trans_' + block.number);
    for(let transaction of block.transactions.filter(e => e.receipt_status == '1' && e.to_address == JOE_ROUTER_ADDRESS)){
        const data = decoder.decodeData(transaction.input);
        const isSwap = data.names.includes('path');
        
        if(!isSwap){
            continue;
        }

        const path = data.inputs[data.names.indexOf('path')];
        const isDestinationSnowDog = path[path.length - 1].toLowerCase() == NON_HEX_SNOWDOG_TOKEN_ADDRESS;
        if(!isDestinationSnowDog){
            continue;
        }

        const swapLog = transaction.logs[transaction.logs.length - 1];
        const syncLog = transaction.logs[transaction.logs.length - 2];

        let swapData = {};
        try{
            swapData = web3.eth.abi.decodeParameters(swapTypes, swapLog.data);
        } catch{
            console.error(block.number, `https://snowtrace.io/tx/${transaction.hash}`)
        }

        const buyAmount = Number(swapData.amount1Out) / Math.pow(10, SNOWDOG_DECIMALS);
        const isMIMPairTrade = syncLog.address == SNOWDOG_MIM_LP_ADDRESS;

        const url = `https://snowtrace.io/tx/${transaction.hash}`;

        if(isMIMPairTrade){
            try{
                const syncData = web3.eth.abi.decodeParameters(syncTypes, syncLog.data);
                const price = syncData.reserve0 / (syncData.reserve1 * Math.pow(10, SNOWDOG_DECIMALS));

                console.log(`SNOWDOG WAS BOUGHT! ${buyAmount} @ ${price} -> ${url}`);
            } catch{
                console.log(block.number)
            }
        } else {
            console.log(`SNOWDOG WAS BOUGHT! ${buyAmount} -> ${url}`);
        }
        //web3.eth.abi.decodeParameters(swapTypes, data)
        //console.log(`${data.method} -> DEST: ${await getTokenNameByAddress(data.inputs[1][data.inputs[1].length - 1])}`);
    }
    console.timeEnd('trans_' + block.number);
}

const tokenAddressDictionary = {};

async function getTokenNameByAddress(address){
    if(!address){
        return 'ERROR';
    }

    if(!tokenAddressDictionary[address]){
        const response = await fetch(`https://api.snowtrace.io/api?module=account&action=tokentx&contractaddress=0x${address}&page=1&offset=1&apikey=FAUEPJNB2ZRSE9IRVVD41R124SUW4XVKQ8`);
        const data = await response.json();
        tokenAddressDictionary[address] = data.result[0].tokenName;
    }

    return tokenAddressDictionary[address];
}



//var a = decoder.decodeData(`0x00000000000000000000000000000000000000000000000006f05b59d3b20000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001d7b589`);
//console.log(a);