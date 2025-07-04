/**
 * @file db.js
 * @brief IndexedDB 数据库操作模块
 * @description 封装了对 IndexedDB 的所有操作，包括数据库初始化、记录的增删改查。
 */

const DB_NAME = 'DivinationHistoryDB';
const STORE_NAME = 'divinations';
const DB_VERSION = 4;

let db = null;

/**
 * 初始化数据库。如果数据库或对象存储不存在，则会创建它们。
 * @returns {Promise<IDBDatabase>} 返回一个 Promise，解析为数据库实例。
 */
function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('数据库打开失败:', event.target.error);
      reject('数据库打开失败');
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('数据库打开成功');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log(`数据库升级中，从版本 ${event.oldVersion} 到 ${event.newVersion}`);
      const db = event.target.result;
      let store;

      // 首次安装 (oldVersion 为 0)
      if (event.oldVersion < 1) {
        console.log('执行首次数据库设置...');
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 版本 2 升级：移除 question 索引
      if (event.oldVersion < 2) {
        console.log('执行版本 2 数据库升级...');
        if (!store) {
          store = event.target.transaction.objectStore(STORE_NAME);
        }
        // 对于从 v1 升级的用户，移除旧的索引
        if (store.indexNames.contains('question')) {
          store.deleteIndex('question');
          console.log('已移除 "question" 索引。');
        }
      }

      // 版本 3 升级：支持存储思考内容
      if (event.oldVersion < 3) {
        console.log('执行版本 3 数据库升级：支持存储AI思考过程...');
        // 旧版本数据自动兼容，reasoning字段将在新记录中自动添加
      }

      // 版本 4 升级：数据格式从 Markdown 改为 HTML
      if (event.oldVersion < 4) {
        console.log('执行版本 4 数据库升级：存储格式从 Markdown 改为渲染后的 HTML...');
        // 旧版本数据仍然兼容，但新数据将保存为 HTML 格式
        // 注意：旧数据仍包含 Markdown，需要在读取时进行兼容处理
      }
    };
  });
}

/**
 * 向数据库中添加一条占卜记录。
 * @param {object} record - 要添加的记录，包含 question, title, result, timestamp。
 * @returns {Promise<number>} 返回一个 Promise，解析为新记录的 ID。
 */
function addRecord(record) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('数据库未初始化');
      return;
    }

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('添加记录失败:', event.target.error);
      reject('添加记录失败');
    };
  });
}

/**
 * 从数据库中获取所有占卜记录。
 * @returns {Promise<Array<object>>} 返回一个 Promise，解析为一个包含所有记录的数组。
 */
function getAllRecords() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('数据库未初始化');
      return;
    }

    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      // 按时间戳降序排序
      const sortedRecords = event.target.result.sort((a, b) => b.timestamp - a.timestamp);
      resolve(sortedRecords);
    };

    request.onerror = (event) => {
      console.error('获取所有记录失败:', event.target.error);
      reject('获取所有记录失败');
    };
  });
}

/**
 * 根据 ID 获取单条记录
 * @param {number} id - 记录的ID
 * @returns {Promise<object>} 返回一个 Promise，解析为找到的记录
 */
function getRecordById(id) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject("数据库未初始化");
        }
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('获取记录失败:', event.target.error);
            reject('获取记录失败');
        };
    });
}

/**
 * 从数据库中删除指定ID的记录
 * @param {number} id - 要删除的记录ID
 * @returns {Promise<void>} 返回一个 Promise
 */
function deleteRecord(id) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject("数据库未初始化");
        }
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            console.error('删除记录失败:', event.target.error);
            reject('删除记录失败');
        };
    });
}

/**
 * 搜索历史记录，匹配标题和问题中的关键词
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array<object>>} 返回一个 Promise，解析为匹配的记录数组
 */
function searchRecords(keyword) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject("数据库未初始化");
        }
        
        if (!keyword || keyword.trim() === '') {
            // 如果关键词为空，返回所有记录
            return getAllRecords().then(resolve).catch(reject);
        }
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = (event) => {
            const allRecords = event.target.result;
            const searchKeyword = keyword.toLowerCase().trim();
            
            // 过滤匹配的记录
            const matchedRecords = allRecords.filter(record => {
                // 检查标题是否包含关键词
                const titleMatch = record.title && record.title.toLowerCase().includes(searchKeyword);
                
                // 检查问题内容是否包含关键词（从meta中提取）
                let questionMatch = false;
                if (record.meta) {
                    // 从meta中提取问题内容
                    const metaLines = record.meta.split('\n');
                    const questionLine = metaLines.find(line => line.startsWith('所问之事：'));
                    if (questionLine) {
                        const question = questionLine.replace('所问之事：', '').trim();
                        questionMatch = question.toLowerCase().includes(searchKeyword);
                    }
                }
                
                return titleMatch || questionMatch;
            });
            
            // 按时间戳降序排序
            const sortedRecords = matchedRecords.sort((a, b) => b.timestamp - a.timestamp);
            resolve(sortedRecords);
        };
        
        request.onerror = (event) => {
            console.error('搜索记录失败:', event.target.error);
            reject('搜索记录失败');
        };
    });
}

// 导出模块函数
export { initDB, addRecord, getAllRecords, getRecordById, deleteRecord, searchRecords }; 