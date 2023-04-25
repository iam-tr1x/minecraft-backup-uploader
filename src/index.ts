import axios from "axios";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { Rcon } from "minecraft-rcon-client";
import { Client, GatewayIntentBits } from "discord.js";
import { createReadStream, readdirSync, lstatSync } from "node:fs";
import { ToadScheduler, SimpleIntervalJob, Task } from 'toad-scheduler';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rconClient = new Rcon({
    host: process.env.MINECRAFT_RCON_IP,
    port: process.env.MINECRAFT_RCON_PORT,
    password: process.env.MINECRAFT_RCON_PASSWORD
});
const scheduler = new ToadScheduler();

function OrderReccentFiles(dir: string)
{
    return readdirSync(dir)
            .filter(file => lstatSync(path.join(dir, file)).isFile())
            .map(file => ({ fileName: file, fileDirectory: path.join(dir, file), modifiedTime: lstatSync(path.join(dir, file)).mtime }))
            .sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());
}

function GetMostRecentFile(dir: string) 
{
    const files = OrderReccentFiles(dir);
    return files.length ? files[0] : undefined;
};

function UploadFile(serverString: string)
{
    const recentFileInformation = GetMostRecentFile(process.env.MINECRAFT_BACKUP_DIRECTORY);
    if (recentFileInformation === undefined)
    {
        throw new Error("Failed to get most recent file! Check if the directory is correct.");
    }

    axios.post(`https://${serverString}.gofile.io/uploadFile`, { file: createReadStream(recentFileInformation.fileDirectory) }, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then(async (res: any) => {
            if (res.data.status === "ok")
            {
                const downloadUrl = res.data.data.downloadPage;
                const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
                await channel.send(`Date: ${recentFileInformation.modifiedTime} Download Link: ${downloadUrl}`);
            }
        }
    )
}

function GetServer()
{
    axios.get("https://api.gofile.io/getServer")
        .then((res: any) => { 
            const serverString = res.data.data.server;
            UploadFile(serverString);
        }
    );
}

function StartBackupTask()
{
    rconClient.connect().then(() => {
        rconClient.send(process.env.MINECRAFT_BACKUP_COMMAND)
            .then(() => {
                GetServer();
                rconClient.disconnect()
            }
        );
    });
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
    scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ hours: 1, runImmediately: true }, new Task("start backup", StartBackupTask)));
});

client.login(process.env.DISCORD_BOT_TOKEN);