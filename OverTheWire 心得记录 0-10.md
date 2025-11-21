# Bandit

## Level 0：`ssh` 远程登录

任务：使用 `ssh` 命令登录 bandit

```shell
ssh -p 2220 bandit0@bandit.labs.overthewire.org
```

使用 `-p` 参数指定端口，然后再使用 `user@ip/host` 指定用户名和 IP 地址（或域名）。

在随后的确认信息中输入密码 `bandit0`。

## Level 0 - Level 1：获取普通文件内容

任务：获取 `readme` 文件中的密码

在 bandit0 的基础上使用 `ls` 命令可以查看到当前目录下的 `readme` 文件，使用 `cat readme` 命令查看文件得到 `bandit1` 的密码为 `ZjLjTmM6FvvyRnrb2rfNWOZOTa6ip5If`。

```shell
ssh -p 2220 bandit1@bandit.labs.overthewire.org
# 然后输入上述密码即可
```

## Level 1 - Level 2：获取 `-` 字符开头的文件内容

任务：获取 `-` 文件中的密码

这里不能直接使用 `cat -` 命令查看该文件。原因在于，`-` 是 `STDIN/STDOUT` 的参数。需要指定绝对路径（full location）才能打开该文件，即 `cat ./-`。密码为 `263JGJPfgU6LtdEvgfWU1XP5yac29mFx`。

## Level 2 - Level 3：获取名称包含空格的文件内容

任务：获取 `--space in this filename--` 文件中的密码

文件名中有空格时，需要在文件名两端添加双引号，即 `cat ./"--space in this filename--"`。密码为 `MNk8KNH3Usiio41PRUEoDFPqfxLPlSmx`。

## Level 3 - Level 4：获取隐藏文件内容

任务：获取 `inhere` 文件夹中一个隐藏文件包含的密码

首先使用 `cd` 命令进入该文件夹，然后使用 `ls -a` 命令查看包含隐藏文件在内的所有文件，再同样使用 `cat` 命令得到密码 `2WmrDFRmJIq3IPxneAaMGhap0pFhF3NJ`。

## Level 4 - Level 5：检测文件类型

任务：获取 `inhere` 文件夹中仅人类可读（only human-readable）文件包含的密码

这个文件夹中存放有从 `-file00` 到 `-file09` 共十个文件，首先需要找出这十个文件哪些文件是人类可读的，也就是 ASCII 或 UTF 形式的文件。使用 `file` 命令检测文件类型，结果通常为：`data`、`ASCII text` 或 `UTF-8 text`，再用管道符号和 `grep` 命令：

```shell
file inhere/* | grep -i text
```

过滤出包含 `text` 关键词的文件，得出结果为 `-file07`。

这些文件以 `-` 开头，直接输入会被当作选项。解决方法之一是使用 `--` 将后续的内容声明为参数而非选项：

```shell
cat -- inhere/-file07
```

得出密码为 `4oQYVPkxZOOEOO5pTW81FB8j8lxXGUQw`。

## Level 5 - Level 6：多条件命令 1：可读、大小与不可执行

任务：`inhere` 文件夹中包含多个文件夹，其中一个文件夹包含一个满足下面 3 个条件的文件，找出该文件：① 人类可读；② 大小为 1033 bytes；③ 非可执行文件。

这道题主要是考多条件命令的写法。

完整的命令如下：

```shell
find inhere/ -type f -size 1033c ! -executable -exec file {} \; | grep "ASCII"
```



1. 第一步是 **确认该文件必须满足人类可读**。这点和上一题一样，需要使用 `file` 命令。`find inhere/` 表示从 `inhere/` 目录开始递归搜索。可选项需要使用 `-type f`，含义是寻找普通文件，而非目录或其他特殊文件。

    其他文件的参数包括 `d`（目录）、`l`（符号链接）、设备文件等

2. 第二步是 **过滤大小**，这里使用的是 `-size` 可选项加 `1033c` 参数，`c` 表示单位是 `bytes`

    如果要设置大于 1033 字节则变为 `+1033c`，设置小于 1033 字节变为 `-1033c`

3. 第三步是 **过滤非可执行文件**，使用 `! -executable`。`-executable` 测试当前运行用户是否能执行该文件

4. `-exec`  后接要执行的命令。`-file {} \;` 的作用是对每个匹配到的文件执行 `file <filename>`，其中 `{}` 是 `find` 的占位符，会被替换为当前文件路径。如果路径存在空格，则需适当引用。`\;` 表示 `-exec` 结尾，分号需要转义以防 shell 解释。

5. `| grep "ASCII"` 只保留包含 `ASCII` 的行（即粗略筛选 ASCII 文本），但更稳妥的匹配可用 `grep -i 'text'` 或 `grep -Ei 'text|utf-8|utf-16|ascii'`。

得出密码为 `HWasnPhtq9AVKe0dmk45nxy20cvUa6EG`。

## Level 6 - Level 7：多条件命令 2：所属组和用户

任务：找出存放在服务器中某处的密码文件，该文件的特征是：①属于用户 `bandit7`；②属于组 `bandit6`；③文件大小为 33 bytes。

本题和上一题思路相同，唯一不同的是使用可选项。

在 `find` 命令中，需要使用 `-group gname` 可选项指定所属组名，使用 `-user` 可选项指定所属用户名，再使用 `-size 33c` 指定大小。为避免出现大量的 `Permission denied` 信息，可以将错误信息重定向到空。

```shell
find / -user bandit7 -group bandit6 -size 33c 2>/dev/null
```

得出密码为 `morbNTDkSW6jIlUc0ymOdMaLnOlFVAaj`。

## Level 7 - Level 8：文件特定内容查找

任务： `data.txt` 文件包含大量行，每一行由一个单词和一行随机字符串组成。真正的密码存放在单词 `millionth` 后。

使用的命令为 `strings`，这是用于在对象文件或二进制文件中查找可打印的字符串的命令。在查找一个特定的字符串时，通常和 `grep` 结合使用。

```shell
strings ./data. | grep -i millionth # -i 表示忽略大小写
```

得出密码为 `dfwvzFQi4mU0wfNbFOe9RoWskMLg7eEc`。

## Level 8 - Level 9：唯一文本行查找

任务：`data.txt` 文件包含大量行，每一行为一段随机字符串，其中唯一一段只出现过一次的字符串即为密码。

需要将 `sort` 命令和 `uniq` 命令结合使用。`sort` 命令会按照自然顺序对文本行排序。`uniq` 命令用于删除或查找文本文件中重复行，只能对已经过排序的文本行生效。

```shell
sort ./data.txt | uniq -u
```

其中，`uniq -u` 的作用是仅显示出现一次的行。得出密码为 `4CKMh1JI91bUIZZPXDqGanal4xvAg0JM`。

## Level 9 - Level 10：正则表达式

任务：`data.txt` 中包含几行人类可读的字符串，其中，密码以几个 `=` 开头的字符串。

可以使用的命令组合有多种，如 `strings` 和 `grep -E`，以及 `strings` 和 `egrep`。以下三种命令是等价的：

```shell
strings ./data.txt | grep -E '^=+'
strings ./data.txt | egrep '^=+'
strings ./data.txt | grep '^=\{1,\}'	# BRE 写法
```

`grep -E` 和 `egrep` 等价，都是表示后续参数为正则表达式。得出密码为 `FGUW5ilLVJrxX9kMYMmlN4MgbpfMiqey`。









