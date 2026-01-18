const fs = require('fs');
const path = require('path');

/**
 * 从 URL 或路径中提取文件名
 * @param {string} urlOrPath - URL 或文件路径
 * @returns {string} 文件名
 */
function extractFilename(urlOrPath) {
  // 处理 3.x 的 db:// 格式 URL
  if (urlOrPath.startsWith('db://')) {
    const parts = urlOrPath.split('/');
    return parts[parts.length - 1];
  }
  // 处理 2.x 的相对路径
  return path.basename(urlOrPath);
}

/**
 * 构建 2.x 版本的文件名索引
 * @param {Object} v2Data - 2.x 版本的资源数据
 * @returns {Map} 文件名到 UUID 的映射
 */
function buildV2Index(v2Data) {
  const filenameToUuid = new Map();
  
  for (const [uuid, info] of Object.entries(v2Data)) {
    if (info.relativePath) {
      const filename = extractFilename(info.relativePath);
      filenameToUuid.set(filename, uuid);
    }
  }
  
  return filenameToUuid;
}

/**
 * 生成 UUID 映射关系
 * @param {Object} v3Data - 3.x 版本的资源数据
 * @param {Object} v2Data - 2.x 版本的资源数据
 * @returns {Object} UUID 映射关系和未匹配列表
 */
function generateUuidMapping(v3Data, v2Data) {
  const v2Index = buildV2Index(v2Data);
  const mapping = {};
  const unmatched = [];
  
  for (const [v3Uuid, info] of Object.entries(v3Data)) {
    if (!info.url) continue;
    
    const fullFilename = extractFilename(info.url);
    let v2Uuid = null;
    
    // 处理带 @ 符号的特殊情况
    if (fullFilename.includes('@')) {
      // 首先尝试完整匹配（包含 @）
      v2Uuid = v2Index.get(fullFilename);
      
      // 如果没找到，尝试去掉 @ 及后面的部分
      if (!v2Uuid) {
        const baseFilename = fullFilename.split('@')[0];
        v2Uuid = v2Index.get(baseFilename);
      }
    } else {
      // 普通文件名直接匹配
      v2Uuid = v2Index.get(fullFilename);
    }
    
    if (v2Uuid) {
      mapping[v3Uuid] = {
        v2Uuid: v2Uuid,
        filename: fullFilename,
        v3Url: info.url
      };
    } else {
      unmatched.push({
        v3Uuid: v3Uuid,
        filename: fullFilename,
        v3Url: info.url
      });
    }
  }
  
  return { mapping, unmatched };
}

/**
 * 主函数
 * @param {string} v3FilePath - 3.x 版本资源文件路径
 * @param {string} v2FilePath - 2.x 版本资源文件路径
 * @param {string} outputPath - 输出映射文件路径（可选）
 */
function main(v3FilePath, v2FilePath, outputPath = 'uuid_mapping.json') {
  try {
    // 读取文件
    const v3Data = JSON.parse(fs.readFileSync(v3FilePath, 'utf8'));
    const v2Data = JSON.parse(fs.readFileSync(v2FilePath, 'utf8'));
    
    // 生成映射
    const { mapping, unmatched } = generateUuidMapping(v3Data, v2Data);
   Object.keys(mapping).forEach((key)=>{
    console.log(`xxxxxxxxxx key=${key} v=${mapping[key].v2Uuid}`)
   })

    // 输出结果
    const result = {
      mappingCount: Object.keys(mapping).length,
      unmatchedCount: unmatched.length,
      mapping: mapping,
      unmatched: unmatched
    };
    
    // 保存到文件
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    
    // 打印统计信息
    console.log(`映射完成！`);
    console.log(`成功映射: ${result.mappingCount} 个`);
    console.log(`未匹配: ${result.unmatchedCount} 个`);
    console.log(`结果已保存到: ${outputPath}`);
    
    // 如果有未匹配项，打印前10个
    if (unmatched.length > 0) {
      console.log('\n未匹配的资源（前10个）:');
      unmatched.slice(0, 10).forEach(item => {
        console.log(`  - ${item.filename} (${item.v3Uuid})`);
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('错误:', error.message);
    throw error;
  }
}

// 使用示例
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('使用方法:');
    console.log('  node script.js <3.x资源文件> <2.x资源文件> [输出文件]');
    console.log('');
    console.log('示例:');
    console.log('  node script.js v3_resources.json v2_resources.json mapping.json');
    process.exit(1);
  }
  
  const [v3File, v2File, output] = args;
  main(v3File, v2File, output);
}

// 导出函数供其他模块使用
module.exports = {
  generateUuidMapping,
  buildV2Index,
  extractFilename,
  main
};