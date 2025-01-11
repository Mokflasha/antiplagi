const {google} = require('googleapis');
const fs = require('fs');
const axios = require("axios");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

const sheetsId = process.env.SHEETS_ID
const keyFile = process.env.GOOGLE_KEY_FILE;


async function GetGoogleReps(sheetsId, range) {
	const auth = new google.auth.GoogleAuth({
		keyFile: keyFile,
		scopes: "https://www.googleapis.com/auth/spreadsheets",
	});
	const client = await auth.getClient();
	const googleSheets = google.sheets({ version: "v4", auth: client });
	const repsData = await googleSheets.spreadsheets.values.get({
		spreadsheetId: sheetsId,
		range: range,
	});

	return repsData.data.values;
}

async function retrieveData () {
	const data = await GetGoogleReps(sheetsId, 'Ответы на форму (1)');
	data.splice(0, 1);
	return data.map(x => x.slice(1));
}

function concatArrs(data) {
	const result = [];
	const seen = new Set();

	for (let group of data) {
		let key = group[0].trim(); 
		if (!seen.has(key)) {
			result.push(group);
			seen.add(key);
		} else {
			const currentGroup = result.find(item => item[0] === key);
			for (let i = 1; i < group.length; i++) {
					if (currentGroup[i]) {
						if (currentGroup[i] !== group[i] && group[i] != '') {
							currentGroup[i] = group[i];
						}
					} else if (group[i] !== '') {
						currentGroup.push(group[i]);
					}
			}
		}
	}
	return result;
}

async function isRepoAccessible(url) {
	try {
		await axios.get(url);
		return { valid: true };
	} catch (e) {
		if (e.response?.status === 404) {
			return { valid: false, reason: 'Репозиторий не существует или приватен' };
		}
	}

	// const gitToken = process.env.GITHUB_TOKEN;
	// try {
	// 	const repoUrl = new URL(url);
	// 	const repoPath = repoUrl.pathname.slice(1).replace('.git', '');
	// 	const apiUrl = `https://api.github.com/repos/${repoPath}`;

	// 	const response = await axios.get(apiUrl, {
	// 		headers: {
	// 		Authorization: `token ${gitToken}` 
	// 		}
	// 	});

	// 	if (response.status === 200) {
	// 		if (response.data.private) {
	// 		return { valid: false, reason: 'Репозиторий не публичный' };
	// 		}
	// 		if (response.data.size === 0) {
	// 		return { valid: false, reason: 'Пустой репозиторий' };
	// 		}
	// 	return { valid: true };
	// 	}
	// 	} catch (error) {
	// 	if (error.response) {
	// 		const status = error.response.status;
	// 		if (status === 404) {
	// 		return { valid: false, reason: 'Репозиторий не существует' };
	// 		}
	// 	}
	// 	return { valid: false, reason: 'Не ссылка' };
	// }
	return { valid: false, reason: 'Неизвестная ошибка' };
}

async function convertToObjects(data, outputFileName) {
	const jsonData = [];

	const tasks = data.map(async (row) => {
		const object = {};
		object["name"] = row[0]; 

		const taskPromises = [];

		for (let i = 1; i <= 6; i++) {
			const value = row[i] || '';
			if (value) {
			taskPromises.push(
				isRepoAccessible(value).then(result => {
					object[`task${i}`] = {
					url: value,
					valid: result.valid,
					reason: result.reason || null
					};
				})
			);
			} else {
			object[`task${i}`] = {
				valid: false,
				reason: 'Ссылка отсутствует'
			};
			}
		}
		await Promise.all(taskPromises);
		jsonData.push(object);
	});

	await Promise.all(tasks);

	jsonData.sort((a, b) => a.name.localeCompare(b.name));

	fs.writeFileSync(outputFileName, JSON.stringify(jsonData, null, 2), "utf8");
	console.log(`Данные сохранены в ${outputFileName}`);
}


async function convertToCSV(data, outputFileName) {
	const header = [{ id: "name", title: "Name" }];
	for (let i = 1; i <= 6; i++) {
		header.push({ id: `task${i}`, title: `Task ${i}` });
		header.push({ id: `task${i}_check`, title: `Task ${i} Check` });
	}

	const csvWriter = createCsvWriter({
		path: outputFileName,
		header: header,
		fieldDelimiter: ";",
	});

	const records = data.map(obj => {
		const record = { name: obj.name };

		for (let i = 1; i <= 6; i++) {
			const task = obj[`task${i}`];

			if (task) {
				record[`task${i}`] = task.valid ? task.url || "Ссылка отсутствует" : task.reason || "Неизвестная причина";
			}
		}
		return record;
	});

	await csvWriter.writeRecords(records);
	const content = fs.readFileSync(outputFileName, "utf8");
	fs.writeFileSync(outputFileName, "\uFEFF" + content, "utf8");
}

(async () => {
try {
	const data = await retrieveData();
	const combinedData = concatArrs(data);
	const convertObjects = convertToObjects(combinedData, 'output.json')
	const jsonData = require("./output.json");
	await convertToCSV(jsonData, 'out.csv');
} catch (error) {
	console.error("Ошибка:", error);
}
})();



// async function distributionReps(repositories, baseFolder){
// 	for (const [taskIndex, repoGroup]of repositories.entries()){
// 		const taskFolder = path.join(baseFolder, `task-${taskIndex+1}`)
// 		await fs.mkdir(taskFolder, {recursive: true})
// 		for (const repo of repoGroup) {
// 			const match = repo.match(/github\.com\/([^\/]+)\//);
// 			if (!match) {
// 				console.error(`Invalid repository URL: ${repo}`);
// 				continue;
// 		}

// 		const accountName = match[1]
// 		const accountFolder = path.join(taskFolder, accountName)

// 		await fs.mkdir(accountFolder, {recursive: true});

// 		const git = simpleGit()
// 		try {
// 			await git.clone(repo, accountFolder);
// 		} catch (error) {
// 			console.error(`Error cloning ${repo}:`, error.message);
// 		}
// 		}
// 	}
// }

// async function getRepsCode(baseFolder){
// 	const tasks = {};
// 	const taskFolders = await fs.readdir(baseFolder, { withFileTypes: true });

// 	for (const task of taskFolders) {
// 		if (task.isDirectory() && task.name.startsWith('task-')) {
// 			const taskPath = path.join(baseFolder, task.name);
// 			const accountFolders = await fs.readdir(taskPath, { withFileTypes: true });

// 			tasks[task.name] = {};

// 			for (const account of accountFolders) {
// 				if (account.isDirectory()) {
// 					const accountPath = path.join(taskPath, account.name);
// 					const files = await getAllFiles(accountPath);
// 						tasks[task.name][account.name] = files; // Сохраняем файлы по аккаунтам
// 				}
// 			}
// 		}
// 	}
// }