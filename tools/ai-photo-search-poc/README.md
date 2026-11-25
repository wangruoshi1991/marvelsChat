# Chinese CLIP 相册检索原型

用简短中文描述，从导入的一批照片中找出相关图片。Chinese-CLIP 在运行服务的电脑上计算，无需训练、账号或云端 AI API 密钥。首次安装和下载模型需要网络，完整缓存后可离线检索。

这是可独立运行的对照原型。整合建议、接口和限制见 [交接说明](../../docs/handoffs/chinese-clip-photo-search-poc.md)。当前正式 App 继续使用原有接口。

## 最快运行

在本目录执行，或在 Mac 上双击 `start.command`：

```sh
./start.command
```

需要先安装 [uv](https://docs.astral.sh/uv/getting-started/installation/)。脚本使用 Python 3.12 和 `requirements.lock.txt` 准备独立环境。打开 <http://127.0.0.1:8765>，导入照片，等待索引完成，再输入描述。例如“海边玩耍的小狗”“桌上的一杯咖啡”。首次下载约 753 MB 的模型可能需要几分钟。此入口按 Control-C 停止。

支持 JPEG、PNG、WebP、HEIC 等格式，单张上限 30 MB。原照片保持原样；程序生成最长边不超过 2048 像素的副本并移除 EXIF/GPS。Live Photo 视频部分暂不处理。描述过长会提示缩短。

Linux 等 POSIX 系统可在本目录用 Python 3.12 安装锁定依赖后运行：

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.lock.txt
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

Mac Apple Silicon 优先使用 MPS，其他环境使用 CPU。macOS 的双击和局域网后台脚本只用于 Mac，未验证 Windows 启动方式。

## 核心流程

照片 → 图片向量 → 保存 SQLite 索引。

中文描述 → 文本向量 → 与图片向量计算余弦相似度 → 按分数返回照片。

后端为 FastAPI、PyTorch、Transformers、SQLite 和 NumPy；网页为普通 HTML、CSS、JavaScript。文件名、来源描述不参与排序；用户的“符合／不符合”反馈用于验证记录，不会自动训练模型。

模型为 [OFA-Sys/chinese-clip-vit-base-patch16](https://huggingface.co/OFA-Sys/chinese-clip-vit-base-patch16)，固定 revision `36e679e65c2a2fead755ae21162091293ad37834`。依赖固定 Transformers 4.57.1；文本侧按该模型 forward 的 CLS 投影计算特征，规避该版本 get_text_features 的 pooler 问题。更换模型或预处理时必须重新建索引，不混用不同模型的向量。

## 复现公开照片测试

仓库只保存来源清单、许可、查询和历史结果。下载脚本按固定 URL 获取图片并核对 SHA-256；来源改变、文件缺失或校验不符时会明确失败，不替换成其他照片。

先运行过 `start.command` 准备环境后，在本目录另开终端：

```sh
.venv/bin/python tests/download_samples.py --sample public-library
./start-public-demo.command
```

保持演示服务运行，再在另一个终端执行：

```sh
.venv/bin/python tests/evaluate_public_library.py
.venv/bin/python tests/validation-round2/run_validation.py
```

第一条评测会将 60 张公开图导入独立测试相册并等待索引，第二条运行已冻结的第二轮查询。新的测试结果写入 `.run/`，不会覆盖 `tests/` 中 2026-11-10 的历史证据。下载图片可能受来源站点可用性影响。

历史结果：60 张公开图、24 条有目标的新描述，18 条预选目标排第 1，24 条均在前 5；人工复核首图完整符合描述 17 条。4 条无目标诊断仍返回候选。数据仅证明此小样本可行，不代表真实个人大相册准确率。详细记录见 [第二轮测试说明](tests/validation-round2/README.md)。

四张公开图片的完整流程测试使用**独立空目录**，不要连接个人相册或现有测试库：

```sh
.venv/bin/python tests/download_samples.py --sample fixtures
PHOTO_SEARCH_DATA=.run/smoke-album .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 18766
# 另开终端，且确保 .run/smoke-album 原先为空
.venv/bin/python tests/smoke.py http://127.0.0.1:18766
.venv/bin/python tests/test_lan_access.py
```

## 局域网演示

Mac 上双击 `start-lan-demo.command`，打开它显示的地址。它使用与个人相册分开的 `.data-public-demo/`；新电脑首次演示仍需先按上文导入公开照片。后台服务可独立于终端运行，双击 `stop-lan-demo.command` 停止。Mac 需保持开机、联网和唤醒；重新登录或重启后再次启动。

同一局域网访问者共用一个相册，可上传、搜索、查看、反馈和清空；操作影响所有访问者。它没有登录或用户隔离，不能作为正式 App 的公开接口。网络地址变化后重新启动；多个网卡可通过 `PHOTO_SEARCH_LAN_IP` 指定已分配到本机物理网卡的 IPv4。Host、Origin 和实际网段检查保留，Uvicorn 不信任代理头。

## 数据目录

- `.data/`：个人原型相册，含副本、缩略图、SQLite 索引和搜索反馈。
- `.data-public-demo/`：公开演示相册。
- `.cache/models/`：模型缓存。
- `.run/`：后台日志和本次复测结果。

以上目录及下载的测试照片由 `.gitignore` 排除。局域网客户端上传的照片与计算都在服务电脑上；本机运行模型不等于手机离线运行。
