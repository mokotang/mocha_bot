// pm2 list
// pm2 restart mocha-bot

// envの読み込み
require('dotenv').config();
// discord.jsのインポート
const { Client, GatewayIntentBits, ChannelType, AttachmentBuilder } = require('discord.js');
// ファイル操作のインポート
const fs = require('fs');
// パス操作のインポート
const path = require('path');
// Geminiのインポート
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Gemini APIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
// ユーザーごとのコンテキストを保存するMap;
const userChatHistories = new Map();
// 日本語解析ライブラリ（kuromoji）の読み込みと準備
const kuromoji = require('kuromoji');
let tokenizer = null;
kuromoji.builder({ dicPath: path.join(__dirname, 'node_modules', 'kuromoji', 'dict') }).build((err, _tokenizer) => {
    if (err) {
        console.error('kuromojiの初期化に失敗しました:', err);
    } else {
        tokenizer = _tokenizer;
        console.log('kuromojiの初期化完了（575判定スタンバイOKにゃ！）');
    }
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});


// ボイスチャンネルごとの通話開始時間を記録するMap
// <channelId, startTime (Date.now()のミリ秒)>
const voiceChannelStartTimes = new Map();

// ログファイルの保存先ディレクトリ
const LOG_DIR = path.join(__dirname, 'logs');

// 死刑画像のパス
const DEATH_PENALTY_PATH = path.join(__dirname, 'images', 'death_penalty.png'); 
// タンタン画像のパス
const TAN_TAN_PATH = path.join(__dirname, 'images', 'tan_tan.png'); 
// チェンのGIFのURL
const CHEN_GIF_PATH = 'https://klipy.com/gifs/chen-endfield-1';


// ボットが起動したときの処理
client.once('ready', () => {
    console.log(`正常にBOTが起動しました`);
    
    // ログディレクトリが存在しない場合は作成
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR);
        console.log(`ログディレクトリを作成しました: ${LOG_DIR}`);
    }
});


// VCの人数に変更があった場合
client.on('voiceStateUpdate', async (oldState, newState) => {
    // BOTが通知を行うテキストチャンネルのIDを定義
    const targetTextChannelId = process.env.TEXT_CHANNEL_ID; 
    // IDからテキストチャンネルの情報を取得
    const textChannel = client.channels.cache.get(targetTextChannelId);
    
    // 人がいない状態からいる状態になった場合
    if (oldState.channelId === null && newState.channelId !== null) {
        // 人が入ったチャンネルの状態を取得
        const newChannel = newState.channel;
        // 古いVCの存在がなぜか取得できなかった場合(稀に起こる)
        if (!newChannel) { // oldChannelだったのをnewChannelに修正
            // 処理を中断
            console.warn('新しいボイスチャンネルがnullです。入室検知スキップ。');
            return;
        }
        // チャンネルのVC人数から、BOT自身を除外
        const newMembersInChannel = newChannel.members.filter(member => member.id !== client.user.id);

        // VC人数が1人の場合
        if (newMembersInChannel.size === 1) { 
            try {
                // 通話開始日時を記録
                voiceChannelStartTimes.set(newChannel.id, Date.now());

                // チャンネルが存在 かつ 種別がテキストチャンネル かつ ボット自身がメッセージ送信権限を持っている
                if (textChannel && textChannel.type === ChannelType.GuildText && textChannel.permissionsFor(client.user).has('SendMessages')) {
                    // 通話開始を通知
                    await textChannel.send(`@everyone ${newState.member.displayName}が「${newChannel.name}」で通話を開始したにゃ！！`);
                }
            } catch (error) {
                console.error('Failed to send @everyone message:', error);
            }
        }
    }

    // 人がいる状態からいない状態になった場合
    if (oldState.channelId !== null) {
        // 古いVCの存在がなぜか取得できなかった場合(稀に起こる)
        if (!oldState.channel) {
            // 処理を中断
            console.warn(`古いボイスチャンネル ${oldState.channelId} がnullです。退出検知スキップ。`);
            return;
        }

        // 無人VCの状態を取得
        const oldChannel = oldState.channel;

        // 無人VCの人数から、BOT自身を除外
        const membersAfterExit = oldChannel.members.filter(member => member.id !== client.user.id);

        // 無人 かつ 開始日時を記録している場合
        if (membersAfterExit.size === 0 && voiceChannelStartTimes.has(oldChannel.id)) {
            const startTime = voiceChannelStartTimes.get(oldChannel.id);
            const endTime = Date.now();
            const durationMs = endTime - startTime;

            // 時間を計算
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

            // 通話時間を記録から削除
            voiceChannelStartTimes.delete(oldChannel.id);
            console.log(`VC「${oldChannel.name}」(${oldChannel.id}) の通話時間を記録から削除しました。`);

            try {
                if (textChannel && textChannel.type === ChannelType.GuildText && textChannel.permissionsFor(client.user).has('SendMessages')) {
                    let durationMessage = '';
                    if (hours > 0) {
                        durationMessage += `${hours}時間`;
                    }
                    if (minutes > 0 || hours > 0) { // 時間があるか、分があれば分も表示
                        durationMessage += `${minutes}分`;
                    }
                    // 秒は常に表示
                    durationMessage += `${seconds}秒`;

                    await textChannel.send(`「${oldChannel.name}」での${durationMessage}の通話が終了したにゃ！ `);
                }
            } catch (error) {
                console.error('Failed to send call duration message:', error);
            }
        }
    }
});

// ユーザーがテキストチャットで発言した場合
client.on('messageCreate', async message => {
    // テキストチャットをcsv形式で保存する処理
    saveLog(message);

    // ガード節
    // ボット自身のメッセージなら以降の処理は実行されない
    if (message.author.bot) return;

    // ボットへのメンションがあるかチェック
    if (message.mentions.users.has(client.user.id)) {
        // 文字列に質問系のワードが含まれる場合
            try {
                // 入力中...のアニメーションを表示
                await message.channel.sendTyping();
                // メンションの文字列（<@BOT_ID>）を取り除き、純粋な質問文を抽出
                const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
                // AIモデルの指定（高速かつ精度の高いgemini-1.5-flashを使用）
                // gemini-3.1-flash-lite-preview
                const model = genAI.getGenerativeModel({
                    model: "gemini-3.1-flash-lite-preview",
                    systemInstruction: "あなたについて尋ねられた場合、geminiではなく猫型のAIを自称してください。語尾には「にゃあ」「にゃ」「にゃ！」といったような猫の語尾をつけてください。必ず回答は60文字以内になるようにして。時間については東京のタイムゾーン(GMT+9)を基準で考えて。基本的にはgoogle検索を使用して質問に対する回答を生成してください。天気に関する質問は日本気象協会のサイトをもとになるべく数字を出して、降水確率、最高気温、最低気温、風速について朝、昼、夜に分けて具体的に回答してください。",
                    tools: [
                            { googleSearch: {} }
                    ]
                });

                // ユーザー毎の過去の会話履歴を取得
                const history = userChatHistories.get(message.author.id) || [];
                // 履歴をもとにチャットセッションを開始
                const chat = model.startChat({ history: history});

                // Geminiにテキストを送信して結果を待つ
                const result = await chat.sendMessage(prompt);
                const responseText = result.response.text();
                const newHistory = await chat.getHistory();

                if (newHistory.length > 20) {
                    userChatHistories.set(message.author.id, newHistory.slice(-20));
                } else {
                    userChatHistories.set(message.author.id, newHistory);
                }		    

                // Geminiの回答を返信
                await message.reply(responseText);

                // Geminiが返答した場合は、ここで終了
                return;
            } catch (error) {
                console.error('Geminiの処理中にエラーが発生しました:', error);
                await message.reply('くぁｗせｄｒｆｔｇｙふじこｌｐ');
                return;
            }

        // メンションしたユーザーに返信
        await message.reply(`${message.author}, 気やすく呼んでんじゃにゃあ！`);
    }

    // 文字列におみくじが含まれる場合、おみくじ結果を通知する処理
    omikuji(message);
});

// Discordにログイン
client.login(process.env.DISCORD_BOT_TOKEN);

// テキストチャットをcsv形式で保存する処理
function saveLog(message) {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const fileName = `${year}-${month}-chat.csv`;
        const filePath = path.join(LOG_DIR, fileName);

        // CSVヘッダー（ファイルが新規作成される場合のみ）
        const header = "発言日時,チャンネルID,チャンネル名,チャンネルの種類,メッセージID,発言者ID,発言者ユーザー名,発言者ニックネーム,発言内容\n";
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, header, { encoding: 'utf8' });
        }

        // 日本時間での yyyymmddhhiiss 形式に変換
        const jstDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); // 明示的に日本時間を取得
        const formattedTimestamp =
            jstDate.getFullYear().toString() +
            (jstDate.getMonth() + 1).toString().padStart(2, '0') +
            jstDate.getDate().toString().padStart(2, '0') +
            jstDate.getHours().toString().padStart(2, '0') +
            jstDate.getMinutes().toString().padStart(2, '0') +
            jstDate.getSeconds().toString().padStart(2, '0');

        const timestamp = escapeCsvField(formattedTimestamp); // escapeCsvField関数を使用
        const channelId = escapeCsvField(message.channel.id);
        const channelName = escapeCsvField(message.channel.name || 'DM Channel');
        const channelType = escapeCsvField(ChannelType[message.channel.type]);
        const messageId = escapeCsvField(message.id);
        const authorId = escapeCsvField(message.author.id);
        const authorUsername = escapeCsvField(message.author.username);
        const authorDisplayName = escapeCsvField(message.member ? message.member.displayName : message.author.username);
        const content = escapeCsvField(message.content); // escapeCsvField関数を使用

        // 1行にまとめる
        const logLine = `${timestamp},${channelId},${channelName},${channelType},${messageId},${authorId},${authorUsername},${authorDisplayName},${content}\n`;

        // ログを保存
        fs.appendFileSync(filePath, logLine, { encoding: 'utf8' });
    } catch (error) {
        console.error('チャットログの保存中にエラーが発生しました:', error);
    }
}

// 文字列におみくじが含まれる場合、おみくじ結果を通知する処理
async function omikuji(message) {
    if (message.content.includes('お') && message.content.includes('み') && message.content.includes('く') && message.content.includes('じ')) {
        const omikujiResults = [
            '大吉、一緒に遊んであげるにゃ',
            '吉、ぼちぼちだにゃ',
            '吉、ぼちぼちだにゃ',
            'タンタン(画像)',
            'チェン(GIF)',
            '大凶、〇ねにゃ！！',
            '大凶、〇ねにゃ！！',
            '死刑(画像)',
        ];
        // 結果を抽選
        const result = omikujiResults[Math.floor(Math.random() * omikujiResults.length)];

        // 死刑の場合は画像だけを送信
        if (result.includes('死刑')) {
            try {
                // 画像ファイルが存在するかチェック
                if (fs.existsSync(DEATH_PENALTY_PATH)) {
                    const fileBuffer = fs.readFileSync(DEATH_PENALTY_PATH);
                    const file = new AttachmentBuilder(fileBuffer, { name: 'death_penalty.png' });
                    await message.channel.send({ files: [file] });
                }
            } catch (error) {
                console.error('大凶の画像を送信中にエラーが発生しました:', error);
            }
        } else if (result.includes('タンタン')) {
            try {
                // 画像ファイルが存在するかチェック
                if (fs.existsSync(TAN_TAN_PATH)) {
                    const fileBuffer = fs.readFileSync(TAN_TAN_PATH);
                    const file = new AttachmentBuilder(fileBuffer, { name: 'tan_tan.png' });
                    await message.channel.send({ files: [file] });
                }
            } catch (error) {
                console.error('タンタンの画像を送信中にエラーが発生しました:', error);
            }
        } else if (result.includes('チェン')) {
            await message.reply(CHEN_GIF_PATH);
        } else {
        // メッセージを送信したユーザーにおみくじ結果文字列を返信
        await message.reply(result);
        }
    }
}

function escapeCsvField(field) {
    if (field === null || typeof field === 'undefined') {
        return '';
    }
    let strField = String(field); 
    if (strField.includes(',') || strField.includes('\n') || strField.includes('"')) {
        return `"${strField.replace(/"/g, '""')}"`;
    }
    return strField;
}
